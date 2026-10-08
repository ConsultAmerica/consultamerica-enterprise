-- 046: Candidate portal — Detailed Apply drafts and candidate-reviewed résumé
--      profiles.
--
-- NOT YET APPLIED. Forward-only and additive: new table, new nullable
-- columns, new indexes and policies. Does not modify or delete any existing
-- row, constraint or policy. Re-runnable (IF NOT EXISTS / DROP POLICY IF EXISTS).
--
-- Depends on: 019 (current_candidate_id(), is_recruiting_staff()), 044 (jobs),
-- 045 (resume_profiles). Shared database note: claims 046 for both
-- consultamerica-enterprise and consultamerica-functional-source.
--
-- Verified against production metadata on 2026-10-07: 045 is NOT applied
-- (no resume_profiles) and functional-source 042 is NOT applied (no
-- candidate_saved_jobs). Apply 045 first; this file fails fast otherwise.

DO $$
BEGIN
  IF to_regclass('public.resume_profiles') IS NULL THEN
    RAISE EXCEPTION '046 requires migration 045 (resume_profiles) to be applied first';
  END IF;
  IF to_regprocedure('public.current_candidate_id()') IS NULL THEN
    RAISE EXCEPTION '046 requires migration 019 (current_candidate_id())';
  END IF;
END $$;

-- The application writes these tables with the service role after resolving
-- the signed-in candidate server-side; every query filters on that candidate.
-- The policies below are defense in depth for any future anon-key access.

-- ---------------------------------------------------------------------------
-- 1. application_drafts — unfinished Detailed Apply work. A draft is never an
--    application: the recruiter ATS reads `applications` only, and recruiting
--    staff are deliberately given NO policy here. Final submission goes
--    through the canonical application service, which creates the
--    application; the draft then records which application it became.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS application_drafts (
  id                        TEXT PRIMARY KEY,
  candidate_id              TEXT NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  job_id                    TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  requisition_id            TEXT NOT NULL REFERENCES job_requisitions(id) ON DELETE CASCADE,
  -- { jobId, requisitionId, slug, title, company } for display after a job closes
  job_snapshot              JSONB NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'DRAFT'
                              CHECK (status IN ('DRAFT', 'SUBMITTING', 'SUBMITTED')),
  -- A résumé in the candidate's own library (documents). SET NULL keeps the
  -- draft if the document row is ever hard-deleted by an administrator.
  resume_document_id        TEXT REFERENCES documents(id) ON DELETE SET NULL,
  -- { contact, profile, answers, step } validated in lib/candidate-portal/drafts.ts
  payload                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_version           INTEGER NOT NULL DEFAULT 1,
  -- Optimistic concurrency: each save names the revision it edited.
  revision                  INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  submitted_application_id  TEXT REFERENCES applications(id) ON DELETE SET NULL,
  submitting_started_at     TIMESTAMPTZ,
  submitted_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT application_drafts_submitted_has_application
    CHECK (status <> 'SUBMITTED' OR submitted_application_id IS NOT NULL OR submitted_at IS NOT NULL)
);

-- One open draft per candidate and requisition (the same key that makes
-- applications unique), so two tabs can never fork the same application.
CREATE UNIQUE INDEX IF NOT EXISTS uq_application_drafts_open
  ON application_drafts (candidate_id, requisition_id)
  WHERE status IN ('DRAFT', 'SUBMITTING');

CREATE INDEX IF NOT EXISTS idx_application_drafts_candidate
  ON application_drafts (candidate_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_drafts_resume
  ON application_drafts (resume_document_id)
  WHERE resume_document_id IS NOT NULL;

ALTER TABLE application_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON application_drafts FROM anon;
REVOKE ALL ON application_drafts FROM authenticated;
GRANT SELECT, DELETE ON application_drafts TO authenticated;

DROP POLICY IF EXISTS application_drafts_self_read ON application_drafts;
CREATE POLICY application_drafts_self_read ON application_drafts
  FOR SELECT TO authenticated
  USING (candidate_id = current_candidate_id());

DROP POLICY IF EXISTS application_drafts_self_delete ON application_drafts;
CREATE POLICY application_drafts_self_delete ON application_drafts
  FOR DELETE TO authenticated
  USING (candidate_id = current_candidate_id() AND status = 'DRAFT');
-- No INSERT/UPDATE policy: writes come only from the server (service role),
-- which validates the payload, the job's eligibility and résumé ownership.
-- No recruiting-staff policy: drafts are private until submitted.

-- ---------------------------------------------------------------------------
-- 2. resume_profiles — candidate corrections stored BESIDE the parser output.
--    `structured` (with evidence quotes and parser_version) is never
--    overwritten by a candidate edit, so recruiters can always see what the
--    résumé itself says versus what the candidate confirmed.
-- ---------------------------------------------------------------------------
ALTER TABLE resume_profiles
  ADD COLUMN IF NOT EXISTS candidate_reviewed     JSONB,
  ADD COLUMN IF NOT EXISTS candidate_reviewed_at  TIMESTAMPTZ;

COMMENT ON COLUMN resume_profiles.candidate_reviewed IS
  'Candidate-corrected profile ({summary, skills, experience, education, certifications}); parser output in `structured` is unchanged.';

-- Candidates may read the profiles of their own résumés (045 granted staff only).
DROP POLICY IF EXISTS resume_profiles_self_read ON resume_profiles;
CREATE POLICY resume_profiles_self_read ON resume_profiles
  FOR SELECT TO authenticated
  USING (candidate_id = current_candidate_id());

-- ---------------------------------------------------------------------------
-- 3. candidate_saved_jobs — originally functional-source 042, which is NOT
--    applied in production. Full, idempotent definition (same shape and
--    policies as 042), so it is a no-op wherever 042 already exists.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidate_saved_jobs (
  id                 TEXT PRIMARY KEY,
  candidate_id       TEXT NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  job_requisition_id TEXT NOT NULL REFERENCES job_requisitions(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, job_requisition_id)
);

CREATE INDEX IF NOT EXISTS idx_candidate_saved_jobs_candidate
  ON candidate_saved_jobs (candidate_id, created_at DESC);

ALTER TABLE candidate_saved_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON candidate_saved_jobs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON candidate_saved_jobs TO authenticated;

DROP POLICY IF EXISTS candidate_saved_jobs_self ON candidate_saved_jobs;
CREATE POLICY candidate_saved_jobs_self ON candidate_saved_jobs
  FOR ALL TO authenticated
  USING (candidate_id = current_candidate_id())
  WITH CHECK (candidate_id = current_candidate_id());

DROP POLICY IF EXISTS candidate_saved_jobs_staff ON candidate_saved_jobs;
CREATE POLICY candidate_saved_jobs_staff ON candidate_saved_jobs
  FOR SELECT TO authenticated
  USING (is_recruiting_staff() OR is_hr_staff());
