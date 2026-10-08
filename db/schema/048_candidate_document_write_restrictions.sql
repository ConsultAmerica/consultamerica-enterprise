-- 048: Candidate document & storage write restrictions (security).
--
-- NOT YET APPLIED. Forward-only. Independent of 046/047 (depends on 019's
-- current_profile_id()/current_candidate_id() and 011/018/020's documents,
-- application_documents). Re-runnable.
--
-- Problem (019 + 013 + 017 as deployed):
--   * storage.objects  candidate_documents_owner_rw / candidate_resumes_owner_rw
--     are FOR ALL: a signed-in candidate calling the Storage API directly can
--     DELETE or overwrite (upsert = UPDATE) the exact résumé file attached to a
--     submitted application.
--   * public.documents  documents_self is FOR ALL: a candidate can hard-DELETE
--     a submitted résumé's metadata row; application_documents.document_id is
--     ON DELETE CASCADE, so that also erases the application → résumé link.
--     They can also repoint storage_path or mark the row DELETED.
--   * public.application_documents  application_documents_self is FOR ALL and
--     its WITH CHECK only proves the DOCUMENT is theirs, not the APPLICATION:
--     a candidate can attach their document to another candidate's
--     application, or remove links from their own submitted applications.
--   * public.candidate_profiles  candidate_profiles_self (013) is FOR ALL: a
--     candidate can change the EMAIL on their own record. Easy Apply files
--     anonymous applications by email, so setting it to the address of someone
--     who has not applied yet would route that person's future application —
--     and résumé — onto the attacker's record and portal.
--
-- The application never needs these candidate writes: every upload, archive
-- and link is performed server-side with the service role after
-- authorization (lib/documents, lib/recruiting/easy-apply*.ts,
-- lib/candidate-portal). This migration therefore narrows candidates to
-- READ their own rows/files and UPLOAD new files into their own folder, and
-- adds triggers that protect submitted documents even from server-side
-- mistakes. Staff read policies are unchanged. Nothing is made public.
--
-- Pre-apply check (shared database): confirm consultamerica-functional-source
-- performs no direct candidate-session (anon key) writes to documents,
-- application_documents or the candidate buckets — see the production steps.

-- ---------------------------------------------------------------------------
-- 1. Storage: owner may read and upload; no owner UPDATE (overwrite) or DELETE.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS candidate_documents_owner_rw ON storage.objects;
DROP POLICY IF EXISTS candidate_documents_owner_read ON storage.objects;
DROP POLICY IF EXISTS candidate_documents_owner_insert ON storage.objects;

CREATE POLICY candidate_documents_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'candidate-documents'
    AND (
      (storage.foldername(name))[1] = current_profile_id()
      OR (storage.foldername(name))[1] = current_candidate_id()
    )
  );

CREATE POLICY candidate_documents_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'candidate-documents'
    AND (
      (storage.foldername(name))[1] = current_profile_id()
      OR (storage.foldername(name))[1] = current_candidate_id()
    )
  );

DROP POLICY IF EXISTS candidate_resumes_owner_rw ON storage.objects;
DROP POLICY IF EXISTS candidate_resumes_owner_read ON storage.objects;
DROP POLICY IF EXISTS candidate_resumes_owner_insert ON storage.objects;

CREATE POLICY candidate_resumes_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'candidate-resumes'
    AND (
      (storage.foldername(name))[1] = current_profile_id()
      OR (storage.foldername(name))[1] = current_candidate_id()
    )
  );

CREATE POLICY candidate_resumes_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'candidate-resumes'
    AND (
      (storage.foldername(name))[1] = current_profile_id()
      OR (storage.foldername(name))[1] = current_candidate_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. documents: candidates read their own rows; all writes are server-side.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS documents_self ON public.documents;
DROP POLICY IF EXISTS documents_self_read ON public.documents;
CREATE POLICY documents_self_read ON public.documents
  FOR SELECT TO authenticated
  USING (
    user_id = current_profile_id()
    OR candidate_id = current_candidate_id()
  );

-- ---------------------------------------------------------------------------
-- 3. application_documents: candidates read links on their own applications.
--    Ownership via a SECURITY DEFINER helper, so the check does not depend on
--    the applications / candidate_profiles policy chain.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION candidate_owns_application(p_application_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM applications
     WHERE id = p_application_id
       AND candidate_id = current_candidate_id()
  );
$$;
REVOKE ALL ON FUNCTION candidate_owns_application(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION candidate_owns_application(TEXT) TO authenticated;

DROP POLICY IF EXISTS application_documents_self ON public.application_documents;
DROP POLICY IF EXISTS application_documents_self_read ON public.application_documents;
CREATE POLICY application_documents_self_read ON public.application_documents
  FOR SELECT TO authenticated
  USING (candidate_owns_application(application_id));

-- ---------------------------------------------------------------------------
-- 3b. candidate_profiles: candidates read their own record; edits (profile
--     page) are server-side and never change email or profile_id.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS candidate_profiles_self ON public.candidate_profiles;
DROP POLICY IF EXISTS candidate_profiles_self_read ON public.candidate_profiles;
CREATE POLICY candidate_profiles_self_read ON public.candidate_profiles
  FOR SELECT TO authenticated
  USING (profile_id = current_profile_id());

-- ---------------------------------------------------------------------------
-- 4. Submitted documents are immutable history (applies to every caller,
--    including the service role). Archiving (status ARCHIVED, is_primary
--    false, archived_at) stays allowed — that is how a candidate removes a
--    submitted résumé from their library.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_submitted_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM application_documents WHERE document_id = OLD.id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Document % is attached to a submitted application and cannot be deleted', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
     OR NEW.document_type IS DISTINCT FROM OLD.document_type
     OR NEW.status = 'DELETED' THEN
    RAISE EXCEPTION 'Document % is attached to a submitted application; only archiving is allowed', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_protect_submitted ON public.documents;
CREATE TRIGGER documents_protect_submitted
  BEFORE UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION protect_submitted_document();

-- The stored file of a submitted document cannot be deleted through Storage
-- (the Storage API deletes the storage.objects row first; the error aborts it).
CREATE OR REPLACE FUNCTION protect_submitted_document_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  IF OLD.bucket_id IN ('candidate-documents', 'candidate-resumes') AND EXISTS (
    SELECT 1
      FROM public.documents d
      JOIN public.application_documents ad ON ad.document_id = d.id
     WHERE d.storage_path = OLD.name
  ) THEN
    RAISE EXCEPTION 'File % belongs to a submitted application and cannot be deleted', OLD.name
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS objects_protect_submitted_documents ON storage.objects;
CREATE TRIGGER objects_protect_submitted_documents
  BEFORE DELETE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION protect_submitted_document_object();

REVOKE ALL ON FUNCTION protect_submitted_document() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION protect_submitted_document_object() FROM PUBLIC, anon, authenticated;
