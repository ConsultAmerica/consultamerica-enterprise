-- 047: Versioned job analyses, persisted match results and a recalculation
--      queue (design: lib/recruiting/match-persistence.ts).
--
-- PREPARED ONLY — DO NOT APPLY until the matching rollout is approved.
-- Nothing in the application reads or writes these tables yet; matching is
-- still computed on demand (lib/recruiting/matching.ts).
--
-- Forward-only and additive. Re-runnable. Depends on 019 and 045.
--
-- Principles enforced by shape:
--  * A match row has no application id and no status of an application: it
--    is evidence for human review, never a decision.
--  * Every row records the matcher version and fingerprints of the exact
--    résumé evidence and job text it came from, so staleness is detectable.
--  * Candidates have no direct table access; the server returns a
--    candidate only their own results for currently open jobs.

CREATE TABLE IF NOT EXISTS job_analyses (
  id                  TEXT PRIMARY KEY,
  requisition_id      TEXT NOT NULL REFERENCES job_requisitions(id) ON DELETE CASCADE,
  analyzer_version    TEXT NOT NULL,
  source_fingerprint  TEXT NOT NULL,
  -- { title, requiredSkills, preferredSkills, minimumYears, degreeRequired, certificationsRequired }
  requirements        JSONB NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_job_analyses_version UNIQUE (requisition_id, analyzer_version, source_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_job_analyses_requisition
  ON job_analyses (requisition_id, created_at DESC);

CREATE TABLE IF NOT EXISTS match_results (
  id                  TEXT PRIMARY KEY,
  candidate_id        TEXT NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  resume_profile_id   TEXT NOT NULL REFERENCES resume_profiles(id) ON DELETE CASCADE,
  requisition_id      TEXT NOT NULL REFERENCES job_requisitions(id) ON DELETE CASCADE,
  job_analysis_id     TEXT NOT NULL REFERENCES job_analyses(id) ON DELETE CASCADE,
  matcher_version     TEXT NOT NULL,
  resume_fingerprint  TEXT NOT NULL,
  job_fingerprint     TEXT NOT NULL,
  score               INTEGER CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  band                TEXT NOT NULL CHECK (band IN ('STRONG', 'MODERATE', 'LIMITED', 'INSUFFICIENT_DATA')),
  -- JobAnalysis: findings[{requirement, kind, status, evidence}], matched, notFound, unknown, explanation
  analysis            JSONB NOT NULL,
  status              TEXT NOT NULL DEFAULT 'CURRENT' CHECK (status IN ('CURRENT', 'STALE')),
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stale_since         TIMESTAMPTZ,
  CONSTRAINT uq_match_results_pair UNIQUE (resume_profile_id, requisition_id, matcher_version)
);

CREATE INDEX IF NOT EXISTS idx_match_results_requisition
  ON match_results (requisition_id, status, score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_match_results_candidate
  ON match_results (candidate_id, status, score DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS match_recalculation_queue (
  id             TEXT PRIMARY KEY,
  subject_type   TEXT NOT NULL CHECK (subject_type IN ('RESUME_PROFILE', 'REQUISITION', 'ALL')),
  subject_id     TEXT NOT NULL,
  reason         TEXT NOT NULL,
  enqueued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at     TIMESTAMPTZ,
  claimed_by     TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  processed_at   TIMESTAMPTZ
);

-- At most one pending task per subject (enqueue is an upsert / no-op when pending).
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_queue_pending
  ON match_recalculation_queue (subject_type, subject_id)
  WHERE processed_at IS NULL;

ALTER TABLE job_analyses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results             ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_recalculation_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON job_analyses, match_results, match_recalculation_queue FROM anon;
REVOKE ALL ON match_recalculation_queue FROM authenticated;

DROP POLICY IF EXISTS job_analyses_recruiting_staff ON job_analyses;
CREATE POLICY job_analyses_recruiting_staff ON job_analyses
  FOR SELECT USING (is_recruiting_staff());

DROP POLICY IF EXISTS match_results_recruiting_staff ON match_results;
CREATE POLICY match_results_recruiting_staff ON match_results
  FOR SELECT USING (is_recruiting_staff());
-- Writes: server (service role) only. No candidate or hiring-manager policy.
