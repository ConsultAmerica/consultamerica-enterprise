-- Candidate portal production readiness — READ-ONLY catalog verification.
--
-- Run in the Supabase SQL editor (or psql) against production BEFORE
-- approving 045 / 046 / 048. It changes nothing: the whole script runs in a
-- READ ONLY transaction and only SELECTs catalog metadata and aggregate
-- counts (no candidate rows, emails or file names are returned).
--
-- Each row: check | expected | actual | ok. Every "ok = false" must be
-- explained before any migration is applied. Migration 047 must stay
-- unapplied: its rows are expected to read "absent".

BEGIN TRANSACTION READ ONLY;

WITH
cols AS (
  SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public'
),
pol AS (
  SELECT schemaname, tablename, policyname, cmd, roles::text AS roles
    FROM pg_policies
),
idx AS (
  SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
),
con AS (
  SELECT conrelid::regclass::text AS tbl, conname, contype, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace
),
trg AS (
  SELECT tgrelid::regclass::text AS tbl, tgname
    FROM pg_trigger
   WHERE NOT tgisinternal
),
fn AS (
  SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
),
checks(section, name, expected, actual) AS (
  -- ── 019: identity helpers and current owner policies ─────────────────────
  SELECT '019', 'current_profile_id() SECURITY DEFINER', 'true',
         COALESCE((SELECT prosecdef::text FROM fn WHERE proname = 'current_profile_id' AND args = ''), 'absent')
  UNION ALL
  SELECT '019', 'current_candidate_id() is single-row (LIMIT 1)', 'true',
         COALESCE((SELECT (def ILIKE '%limit 1%')::text FROM fn WHERE proname = 'current_candidate_id' AND args = ''), 'absent')
  UNION ALL
  SELECT '019', 'documents_self policy (FOR ALL, pre-048)', 'ALL',
         COALESCE((SELECT cmd FROM pol WHERE tablename = 'documents' AND policyname = 'documents_self'), 'absent')
  UNION ALL
  SELECT '019', 'application_documents_self policy (FOR ALL, pre-048)', 'ALL',
         COALESCE((SELECT cmd FROM pol WHERE tablename = 'application_documents' AND policyname = 'application_documents_self'), 'absent')
  UNION ALL
  SELECT '013', 'candidate_profiles_self policy (FOR ALL, pre-048)', 'ALL',
         COALESCE((SELECT cmd FROM pol WHERE tablename = 'candidate_profiles' AND policyname = 'candidate_profiles_self'), 'absent')
  UNION ALL
  SELECT '019', 'storage candidate_documents_owner_rw (FOR ALL, pre-048)', 'ALL',
         COALESCE((SELECT cmd FROM pol WHERE schemaname = 'storage' AND policyname = 'candidate_documents_owner_rw'), 'absent')
  UNION ALL
  SELECT '019', 'storage candidate_resumes_owner_rw (FOR ALL, pre-048)', 'ALL',
         COALESCE((SELECT cmd FROM pol WHERE schemaname = 'storage' AND policyname = 'candidate_resumes_owner_rw'), 'absent')
  UNION ALL
  SELECT '014', 'storage staff read policies present', '2',
         (SELECT count(*)::text FROM pol WHERE schemaname = 'storage'
            AND policyname IN ('candidate_documents_staff_read', 'candidate_resumes_staff_read'))
  UNION ALL
  SELECT 'storage', 'all policies on storage.objects (names, for review)', '(review)',
         (SELECT string_agg(policyname || ':' || cmd, ', ' ORDER BY policyname) FROM pol WHERE schemaname = 'storage' AND tablename = 'objects')
  UNION ALL
  SELECT 'storage', 'candidate buckets are private', '0 public',
         (SELECT count(*) FILTER (WHERE public)::text || ' public' FROM storage.buckets
           WHERE id IN ('candidate-documents', 'candidate-resumes', 'employee-documents'))

  -- ── 020 / 016 / 018: document integrity the app relies on ─────────────────
  UNION ALL
  SELECT '020', 'uq_application_documents_one_resume index', 'present',
         CASE WHEN EXISTS (SELECT 1 FROM idx WHERE indexname = 'uq_application_documents_one_resume') THEN 'present' ELSE 'absent' END
  UNION ALL
  SELECT '020', 'application_documents_immutable_document trigger', 'present',
         CASE WHEN EXISTS (SELECT 1 FROM trg WHERE tgname = 'application_documents_immutable_document') THEN 'present' ELSE 'absent' END
  UNION ALL
  SELECT '016', 'idx_documents_one_primary_resume index', 'present',
         CASE WHEN EXISTS (SELECT 1 FROM idx WHERE indexname = 'idx_documents_one_primary_resume') THEN 'present' ELSE 'absent' END
  UNION ALL
  SELECT '018', 'uq_application_documents_app_doc_role index', 'present',
         CASE WHEN EXISTS (SELECT 1 FROM idx WHERE indexname = 'uq_application_documents_app_doc_role') THEN 'present' ELSE 'absent' END

  -- ── identity / duplicate-prevention keys ─────────────────────────────────
  UNION ALL
  SELECT '002', 'candidate_profiles.email UNIQUE', 'present',
         CASE WHEN EXISTS (SELECT 1 FROM con WHERE tbl = 'candidate_profiles' AND contype = 'u' AND def ILIKE '%(email)%')
                OR EXISTS (SELECT 1 FROM idx WHERE tablename = 'candidate_profiles' AND indexdef ILIKE '%unique%(email)%')
              THEN 'present' ELSE 'absent' END
  UNION ALL
  SELECT '002', 'applications UNIQUE (candidate_id, requisition_id)', 'present',
         CASE WHEN EXISTS (SELECT 1 FROM con WHERE tbl = 'applications' AND contype = 'u' AND def ILIKE '%candidate_id, requisition_id%')
                OR EXISTS (SELECT 1 FROM idx WHERE tablename = 'applications' AND indexdef ILIKE '%unique%candidate_id, requisition_id%')
              THEN 'present' ELSE 'absent' END
  UNION ALL
  SELECT '004', 'profiles.auth_user_id UNIQUE', 'present',
         CASE WHEN EXISTS (SELECT 1 FROM con WHERE tbl = 'profiles' AND contype = 'u' AND def ILIKE '%(auth_user_id)%')
                OR EXISTS (SELECT 1 FROM idx WHERE tablename = 'profiles' AND indexdef ILIKE '%unique%(auth_user_id)%')
              THEN 'present' ELSE 'absent' END

  -- ── 026 (functional-source): applied in production per PostgREST metadata ─
  UNION ALL
  SELECT '026', 'candidate_profiles city/state/professional_summary/github_url', '4',
         (SELECT count(*)::text FROM cols WHERE table_name = 'candidate_profiles'
            AND column_name IN ('city', 'state', 'professional_summary', 'github_url'))
  UNION ALL
  SELECT '026', 'job_match_analyses policies (self ALL, staff SELECT)', 'job_match_analyses_self:ALL, job_match_analyses_staff:SELECT',
         COALESCE((SELECT string_agg(policyname || ':' || cmd, ', ' ORDER BY policyname) FROM pol WHERE tablename = 'job_match_analyses'), 'absent')
  UNION ALL
  SELECT '026', 'idx_job_match_analyses_candidate', 'present',
         CASE WHEN EXISTS (SELECT 1 FROM idx WHERE indexname = 'idx_job_match_analyses_candidate') THEN 'present' ELSE 'absent' END
  UNION ALL
  SELECT '026', 'job_match_analyses RLS enabled', 'true',
         COALESCE((SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.job_match_analyses')), 'absent')

  -- ── 042 (functional-source): expected NOT applied; 046 recreates its table ─
  UNION ALL
  SELECT '042', 'candidate_saved_jobs', 'absent (046 creates it)',
         CASE WHEN to_regclass('public.candidate_saved_jobs') IS NULL THEN 'absent (046 creates it)' ELSE 'present' END
  UNION ALL
  SELECT '042', 'candidate_proposal_drafts (042 only; not used by this app)', 'absent',
         CASE WHEN to_regclass('public.candidate_proposal_drafts') IS NULL THEN 'absent' ELSE 'present' END

  -- ── 045 / 046 / 047 / 048: expected NOT applied yet ───────────────────────
  UNION ALL
  SELECT '045', 'resume_profiles / email_intake_* / assistant_rate_limits', 'absent',
         CASE WHEN COALESCE(to_regclass('public.resume_profiles'), to_regclass('public.email_intake_messages'),
                            to_regclass('public.assistant_rate_limits')) IS NULL THEN 'absent' ELSE 'partially or fully present' END
  UNION ALL
  SELECT '046', 'application_drafts', 'absent',
         CASE WHEN to_regclass('public.application_drafts') IS NULL THEN 'absent' ELSE 'present' END
  UNION ALL
  SELECT '047', 'job_analyses / match_results (MUST stay unapplied)', 'absent',
         CASE WHEN COALESCE(to_regclass('public.job_analyses'), to_regclass('public.match_results')) IS NULL THEN 'absent' ELSE 'PRESENT' END
  UNION ALL
  SELECT '048', 'candidate_owns_application() / protection triggers', 'absent',
         CASE WHEN EXISTS (SELECT 1 FROM fn WHERE proname IN ('candidate_owns_application', 'protect_submitted_document'))
                OR EXISTS (SELECT 1 FROM trg WHERE tgname LIKE 'objects_protect_submitted_documents%')
              THEN 'present' ELSE 'absent' END

  -- ── 046 prerequisites (FK targets must be TEXT primary keys) ──────────────
  UNION ALL
  SELECT '046-dep', 'PK types of candidate_profiles/jobs/job_requisitions/applications/documents', 'text,text,text,text,text',
         (SELECT string_agg(data_type, ',' ORDER BY array_position(ARRAY['candidate_profiles','jobs','job_requisitions','applications','documents'], table_name::text))
            FROM cols WHERE column_name = 'id'
             AND table_name IN ('candidate_profiles', 'jobs', 'job_requisitions', 'applications', 'documents'))
  UNION ALL
  SELECT '046-dep', 'name collisions: application_drafts policies / uq_application_drafts_open', 'none',
         CASE WHEN EXISTS (SELECT 1 FROM pol WHERE policyname LIKE 'application_drafts_%')
                OR EXISTS (SELECT 1 FROM idx WHERE indexname IN ('uq_application_drafts_open', 'idx_application_drafts_candidate'))
              THEN 'COLLISION' ELSE 'none' END

  -- ── 048 prerequisites ────────────────────────────────────────────────────
  UNION ALL
  SELECT '048-dep', 'current role may create triggers on storage.objects', 'true',
         has_table_privilege(current_user, 'storage.objects', 'TRIGGER')::text
  UNION ALL
  SELECT '048-dep', 'storage.objects has version column (overwrite guard)', 'true',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'storage' AND table_name = 'objects' AND column_name = 'version')::text
  UNION ALL
  SELECT '048-dep', 'existing triggers on storage.objects (for review)', '(review)',
         (SELECT string_agg(tgname, ', ' ORDER BY tgname) FROM trg WHERE tbl = 'storage.objects')

  -- ── data invariants (aggregate counts only) ──────────────────────────────
  UNION ALL
  SELECT 'data', 'candidate emails duplicated case-insensitively', '0',
         (SELECT count(*)::text FROM (SELECT lower(email) FROM candidate_profiles GROUP BY 1 HAVING count(*) > 1) d)
  UNION ALL
  SELECT 'data', 'profiles sharing one auth user', '0',
         (SELECT count(*)::text FROM (SELECT auth_user_id FROM profiles WHERE auth_user_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d)
  UNION ALL
  SELECT 'data', 'candidate records per profile > 1 (current_candidate_id() is LIMIT 1)', '0',
         (SELECT count(*)::text FROM (SELECT profile_id FROM candidate_profiles WHERE profile_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d)
  UNION ALL
  SELECT 'data', 'applications with more than one RESUME link', '0',
         (SELECT count(*)::text FROM (SELECT application_id FROM application_documents WHERE document_role = 'RESUME' GROUP BY 1 HAVING count(*) > 1) d)
  UNION ALL
  SELECT 'data', 'submitted résumé links whose document row is missing or DELETED', '0',
         (SELECT count(*)::text FROM application_documents ad LEFT JOIN documents d ON d.id = ad.document_id
           WHERE d.id IS NULL OR d.status = 'DELETED')
  UNION ALL
  SELECT 'data', 'submitted documents whose storage object is missing', '0',
         (SELECT count(*)::text FROM documents d JOIN application_documents ad ON ad.document_id = d.id
           WHERE d.storage_path IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM storage.objects o
                              WHERE o.bucket_id IN ('candidate-documents', 'candidate-resumes') AND o.name = d.storage_path))
  UNION ALL
  SELECT 'data', 'candidate records with portal profile / without (info)', '(info)',
         (SELECT count(*) FILTER (WHERE profile_id IS NOT NULL)::text || ' / ' || count(*) FILTER (WHERE profile_id IS NULL)::text
            FROM candidate_profiles)
)
SELECT section AS "check group",
       name    AS "check",
       expected,
       actual,
       CASE WHEN expected IN ('(review)', '(info)') THEN NULL ELSE expected = actual END AS ok
  FROM checks
 ORDER BY section, name;

ROLLBACK;
