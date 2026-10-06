-- Candidate documents enrichment for portal upload.
-- Additive only: primary resume flag, status, updated_at, expanded types.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS is_primary_resume BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents
  ADD CONSTRAINT documents_status_check CHECK (
    status IN ('ACTIVE', 'ARCHIVED', 'DELETED')
  );

-- Expand document_type to match portal + application needs.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_document_type_check;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS candidate_documents_document_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_document_type_check CHECK (
    document_type IN (
      'RESUME', 'COVER_LETTER', 'PORTFOLIO',
      'TRANSCRIPT', 'CERTIFICATION', 'OTHER'
    )
  );

-- At most one primary resume per candidate (among ACTIVE rows).
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_one_primary_resume
  ON documents (candidate_id)
  WHERE is_primary_resume = TRUE AND status = 'ACTIVE' AND document_type = 'RESUME';

CREATE INDEX IF NOT EXISTS idx_documents_candidate_status
  ON documents (candidate_id, status, uploaded_at DESC);
