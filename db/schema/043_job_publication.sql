-- Public job publication lives on `jobs`, which already belongs to a requisition.
-- Existing columns (status, published_at, closed_at, salary on job_requisitions,
-- skills on job_skills) are reused. These dates support schedule and expiry.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS application_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS experience_level TEXT;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS job_postings_status_check;
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (
  status IN (
    'DRAFT',
    'APPROVED',
    'SCHEDULED',
    'OPEN',
    'PUBLISHED',
    'PAUSED',
    'UNPUBLISHED',
    'FILLED',
    'CLOSED',
    'EXPIRED',
    'ARCHIVED'
  )
);

CREATE INDEX IF NOT EXISTS idx_jobs_public_open
  ON jobs (published_at DESC)
  WHERE status IN ('PUBLISHED', 'OPEN');

CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs (expires_at);

CREATE TABLE IF NOT EXISTS job_maintenance_runs (
  id TEXT PRIMARY KEY,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_count INTEGER NOT NULL DEFAULT 0,
  expired_count INTEGER NOT NULL DEFAULT 0,
  still_active INTEGER NOT NULL DEFAULT 0,
  errors TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE job_maintenance_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS job_maintenance_runs_staff ON job_maintenance_runs;
CREATE POLICY job_maintenance_runs_staff ON job_maintenance_runs
  FOR ALL USING (
    current_user_has_role('RECRUITER')
    OR current_user_has_role('SYSTEM_ADMIN')
    OR current_user_has_role('HR_ADMIN')
  );

DROP POLICY IF EXISTS jobs_public_read ON jobs;
CREATE POLICY jobs_public_read ON jobs
  FOR SELECT
  USING (
    status IN ('PUBLISHED', 'OPEN')
    AND COALESCE(is_demo, FALSE) = FALSE
    AND (publish_at IS NULL OR publish_at <= NOW())
    AND (published_at IS NULL OR published_at <= NOW())
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (application_deadline IS NULL OR application_deadline > NOW())
  );
