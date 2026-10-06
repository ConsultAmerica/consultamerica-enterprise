-- Align application_documents with document_role + attached_at naming,
-- and add archived_at on documents for historical resume versions.
-- Canonical metadata table remains `documents` (ex candidate_documents / 011).
-- Do NOT create a second resume table.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE application_documents
  ADD COLUMN IF NOT EXISTS document_role TEXT;

ALTER TABLE application_documents
  ADD COLUMN IF NOT EXISTS attached_at TIMESTAMPTZ;

-- Backfill role/attached_at from existing purpose/created_at.
UPDATE application_documents
   SET document_role = COALESCE(document_role, purpose, 'OTHER')
 WHERE document_role IS NULL;

UPDATE application_documents
   SET attached_at = COALESCE(attached_at, created_at, NOW())
 WHERE attached_at IS NULL;

ALTER TABLE application_documents
  ALTER COLUMN document_role SET DEFAULT 'OTHER';

ALTER TABLE application_documents
  ALTER COLUMN attached_at SET DEFAULT NOW();

-- Keep purpose in sync for older readers (purpose remains nullable alias).
UPDATE application_documents
   SET purpose = document_role
 WHERE purpose IS NULL AND document_role IS NOT NULL;

ALTER TABLE application_documents DROP CONSTRAINT IF EXISTS application_documents_document_role_check;
ALTER TABLE application_documents
  ADD CONSTRAINT application_documents_document_role_check CHECK (
    document_role IN ('RESUME', 'COVER_LETTER', 'SUPPORTING', 'OTHER', 'PORTFOLIO')
  );

-- Prefer role-aware uniqueness: same file may attach once per role.
DO $$
BEGIN
  ALTER TABLE application_documents
    DROP CONSTRAINT IF EXISTS application_documents_application_id_document_id_key;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

DROP INDEX IF EXISTS application_documents_application_id_document_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_application_documents_app_doc_role
  ON application_documents (application_id, document_id, document_role);

-- Compatibility read model for specs that say candidate_documents.
CREATE OR REPLACE VIEW candidate_documents AS
  SELECT
    id,
    candidate_id,
    document_type,
    file_name,
    storage_path,
    mime_type,
    file_size,
    is_primary_resume,
    status,
    uploaded_at AS created_at,
    updated_at,
    user_id AS uploaded_by_user_id,
    archived_at
  FROM documents;
