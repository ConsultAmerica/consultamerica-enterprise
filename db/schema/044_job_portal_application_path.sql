-- Application path and public compensation for the job portal.
-- INTERNAL jobs apply through Consult America. EXTERNAL jobs open a validated URL.
-- verified is an explicit staff confirmation. It is not implied by the row existing.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS application_type TEXT NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN IF NOT EXISTS external_apply_url TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS company_summary TEXT,
  ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS salary_min NUMERIC,
  ADD COLUMN IF NOT EXISTS salary_max NUMERIC,
  ADD COLUMN IF NOT EXISTS salary_period TEXT,
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS external_job_id TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_status TEXT;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_application_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_application_type_check
  CHECK (application_type IN ('INTERNAL', 'EXTERNAL'));

CREATE INDEX IF NOT EXISTS idx_jobs_public_search
  ON jobs (status, published_at DESC)
  WHERE status IN ('PUBLISHED', 'OPEN');

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_source_external_id
  ON jobs (source, external_job_id)
  WHERE source IS NOT NULL AND external_job_id IS NOT NULL;
