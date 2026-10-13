-- ============================================================================
-- 003_consulthire.sql — AI interviews alongside Easy Apply
-- ============================================================================
--
-- Adds the ConsultHire integration to the existing recruitment schema. Every
-- statement is additive and every new column is nullable or defaulted, so this
-- can be applied to a database that is serving traffic: nothing existing is
-- rewritten, no column is dropped, and no row is touched except to receive a
-- default.
--
-- The five applications and two candidates already in the system keep working
-- exactly as they are. They become `method = 'EASY_APPLY'`, which is what they
-- have always been in everything but name.
--
-- Written to be re-runnable. Applying it twice is a no-op, so a half-finished
-- migration can simply be run again.
-- ============================================================================

-- ----------------------------------------------------------------- jobs
--
-- A job gains a role-level interview in ConsultHire when it is published. The
-- link belongs to the opening, not to any candidate: everyone who applies to
-- this job is interviewed against the same plan, and each gets their own
-- session underneath it.
--
-- consulthire_status is the generation lifecycle, kept separate from the job's
-- own status so a failed interview generation never blocks a job from being
-- published. A job with no interview is a job that offers Easy Apply only,
-- which is a perfectly good state and the one all ten are in today.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS consulthire_role_id   text,
  ADD COLUMN IF NOT EXISTS consulthire_slug      text,
  ADD COLUMN IF NOT EXISTS consulthire_url       text,
  ADD COLUMN IF NOT EXISTS consulthire_status    text NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS consulthire_error     text,
  ADD COLUMN IF NOT EXISTS consulthire_synced_at timestamptz;

DO $$
BEGIN
  ALTER TABLE jobs ADD CONSTRAINT jobs_consulthire_status_ck
    CHECK (consulthire_status IN ('NONE', 'PENDING', 'READY', 'FAILED'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- One job, one interview link. Without this a retry that raced with itself
-- could leave two ConsultHire roles pointing at the same opening and split the
-- applicants between them.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_consulthire_role_idx
  ON jobs (consulthire_role_id) WHERE consulthire_role_id IS NOT NULL;

-- --------------------------------------------------------- applications
--
-- How the candidate applied. NOT NULL with a default rather than nullable:
-- "we do not know how this person applied" is not a state worth being able to
-- represent, and every existing row genuinely is an Easy Apply submission.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'EASY_APPLY';

DO $$
BEGIN
  ALTER TABLE applications ADD CONSTRAINT applications_method_ck
    CHECK (method IN ('EASY_APPLY', 'AI_INTERVIEW'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- The Applications queue filters on this, and the dashboard counts by it.
CREATE INDEX IF NOT EXISTS applications_method_idx ON applications (method);

-- ------------------------------------------------------------ interviews
--
-- The table already existed with consulthire_interview_id, score and summary,
-- built for exactly this and never populated. These columns complete it.
--
-- report is jsonb, not text: it is ConsultHire's structured EvaluationReport
-- (competencies, strengths, concerns, per-question analysis) and the dashboard
-- renders sections of it. Storing it as text would mean parsing on every read
-- and no way to query inside it later.
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS report               jsonb,
  ADD COLUMN IF NOT EXISTS verdict              text,
  ADD COLUMN IF NOT EXISTS transcript_url       text,
  ADD COLUMN IF NOT EXISTS second_round_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS launched_at          timestamptz;

-- THE IDEMPOTENCY KEY FOR THE WEBHOOK.
--
-- ConsultHire may deliver a completion more than once: a retry after a
-- timeout, a re-score after a candidate resumes and finishes. Each delivery is
-- an upsert against this index, so the second one updates the first row rather
-- than creating a duplicate interview with a second score. Without it, a
-- single retried webhook would give one application two conflicting results
-- and no way to tell which is current.
CREATE UNIQUE INDEX IF NOT EXISTS interviews_consulthire_id_uidx
  ON interviews (consulthire_interview_id) WHERE consulthire_interview_id IS NOT NULL;

-- One AI interview per application. A candidate who relaunches the link
-- resumes their session rather than starting a second scored attempt.
CREATE UNIQUE INDEX IF NOT EXISTS interviews_application_ai_uidx
  ON interviews (application_id) WHERE kind = 'AI_SCREEN';

-- Dashboard reads: "show me everything waiting on a score" and the
-- reconciliation sweep that rescues a webhook that never arrived.
CREATE INDEX IF NOT EXISTS interviews_status_idx ON interviews (status, created_at DESC);
