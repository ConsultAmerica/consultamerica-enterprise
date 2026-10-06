-- Single-source document model hardening.
-- Canonical metadata table remains `documents` (ex candidate_documents).
-- application_documents links applications without copying binaries.

ALTER TABLE application_documents
  ADD COLUMN IF NOT EXISTS purpose TEXT;

ALTER TABLE application_documents DROP CONSTRAINT IF EXISTS application_documents_purpose_check;
ALTER TABLE application_documents
  ADD CONSTRAINT application_documents_purpose_check CHECK (
    purpose IS NULL OR purpose IN (
      'RESUME', 'COVER_LETTER', 'SUPPORTING', 'OTHER'
    )
  );

-- Storage RLS: allow owner paths keyed by candidate_id folder
-- ({candidate_id}/{document_id}/file) in addition to legacy profile_id paths.
DROP POLICY IF EXISTS candidate_documents_owner_rw ON storage.objects;
CREATE POLICY candidate_documents_owner_rw ON storage.objects
  FOR ALL USING (
    bucket_id = 'candidate-documents'
    AND (
      (storage.foldername(name))[1] = current_profile_id()
      OR (storage.foldername(name))[1] IN (
        SELECT id FROM candidate_profiles WHERE profile_id = current_profile_id()
      )
    )
  );
