-- Corrections to 001_init.sql, found while building the data layer against it.
-- Each one is a hole that only shows up under concurrency or at the point a
-- particular screen gets written, which is exactly when a schema review misses
-- them.

-- 1. A killed sync worker used to strand its row forever.
--    claimDueSyncJobs only picks up PENDING and FAILED, so a row left
--    IN_PROGRESS by a crashed process was never reclaimed and the application
--    silently never reached the CRM. claimed_at lets a reaper time the lease
--    out and put it back.
ALTER TABLE zoho_sync_queue
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS zoho_sync_stuck_idx
  ON zoho_sync_queue (claimed_at)
  WHERE status = 'IN_PROGRESS';

-- 2. Queue dedupe was best-effort.
--    enqueueZohoSync guards with WHERE NOT EXISTS, which two concurrent callers
--    can both pass. Harmless while the Zoho operation is an upsert, but it
--    stops being harmless the moment a non-idempotent operation is added.
--    Partial, so completed rows stay as history and can repeat.
CREATE UNIQUE INDEX IF NOT EXISTS zoho_sync_pending_key
  ON zoho_sync_queue (entity_type, entity_id, operation)
  WHERE status IN ('PENDING', 'FAILED', 'IN_PROGRESS');

-- 3. "Every application by this person" was a sequential scan.
--    applications_job_candidate_key is (job_id, candidate_id); a composite
--    index cannot serve a lookup on its second column alone, and the candidate
--    profile page is exactly that lookup.
CREATE INDEX IF NOT EXISTS applications_candidate_idx
  ON applications (candidate_id);

-- 4. consulthire_interview_id exists to pull a result back from ConsultHire,
--    which means looking a row up by that value. It had no index.
CREATE INDEX IF NOT EXISTS interviews_consulthire_idx
  ON interviews (consulthire_interview_id)
  WHERE consulthire_interview_id IS NOT NULL;

-- 5. A PUBLISHED job with no published_at was representable.
--    Both write paths stamp it, but nothing enforced it, and such a row sorts
--    to the bottom of /careers under the NULLS LAST ordering rather than
--    failing loudly. Backfill first so the constraint can be trusted, then
--    close the hole.
UPDATE jobs SET published_at = COALESCE(published_at, updated_at, created_at)
  WHERE status = 'PUBLISHED' AND published_at IS NULL;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_published_at_ck;
ALTER TABLE jobs ADD CONSTRAINT jobs_published_at_ck
  CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL);

-- Deliberately NOT changed, recorded so the next reader knows it was considered:
--
--   * candidates.first_name / last_name still permit ''. The sparse upsert
--     depends on it: a re-application that omits a name must not blank the one
--     already captured, which is expressed as "insert '', never overwrite with
--     ''". Non-empty is enforced in the application layer at submit time
--     instead, where a real validation message can be shown.
--
--   * application_deadline is still unenforced. Whether a passed deadline
--     hides the role, refuses the submission, or merely renders "applications
--     closed" is a product decision, not a schema one, and silently rejecting
--     submissions is the worst of the three.
