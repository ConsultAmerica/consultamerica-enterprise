-- 045: Email job intake (Zoho Mail → recruiter review → draft requisition),
--      public assistant rate limiting, resume profiles and Detailed Apply snapshots.
--
-- Forward-only and additive: creates new private tables, indexes, policies and
-- one function. Does not modify or delete any existing row, table, constraint
-- or policy. Re-runnable (IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE).
--
-- Shared database note: consultamerica-functional-source uses the same
-- db/schema numbering and currently ends at 044; this file claims 045 for both
-- repositories.

-- ---------------------------------------------------------------------------
-- 1. Intake sources: one row per connected mailbox folder, holding the sync
--    cursor. initial_sync_after bounds the first sync so historical mail is
--    never ingested without an explicit decision.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_intake_sources (
  id                       TEXT PRIMARY KEY,
  provider                 TEXT NOT NULL CHECK (provider IN ('zoho', 'mock')),
  provider_account_id      TEXT NOT NULL,
  provider_folder_id       TEXT NOT NULL,
  mailbox_address          TEXT,
  folder_name              TEXT,
  initial_sync_after       TIMESTAMPTZ NOT NULL,
  sync_cursor_received_at  TIMESTAMPTZ,
  sync_lock_owner          TEXT,
  sync_lock_until          TIMESTAMPTZ,
  last_sync_started_at     TIMESTAMPTZ,
  last_sync_completed_at   TIMESTAMPTZ,
  last_sync_status         TEXT CHECK (last_sync_status IN ('OK', 'PARTIAL', 'FAILED')),
  last_error               TEXT,
  consecutive_failures     INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_email_intake_source UNIQUE (provider, provider_account_id, provider_folder_id)
);

-- ---------------------------------------------------------------------------
-- 2. Intake messages: one row per provider message (idempotency boundary is
--    provider + account + provider message id). Never a public job.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_intake_messages (
  id                         TEXT PRIMARY KEY,
  source_id                  TEXT NOT NULL REFERENCES email_intake_sources(id),
  provider                   TEXT NOT NULL CHECK (provider IN ('zoho', 'mock')),
  provider_account_id        TEXT NOT NULL,
  provider_folder_id         TEXT NOT NULL,
  provider_message_id        TEXT NOT NULL,
  provider_thread_id         TEXT,
  from_address               TEXT,
  from_name                  TEXT,
  to_addresses               TEXT[] NOT NULL DEFAULT '{}',
  cc_addresses               TEXT[] NOT NULL DEFAULT '{}',
  subject                    TEXT,
  received_at                TIMESTAMPTZ NOT NULL,
  -- Plain text of the body plus extracted attachment text, capped in code.
  normalized_text            TEXT,
  has_attachments            BOOLEAN NOT NULL DEFAULT FALSE,
  -- [{ providerAttachmentId, name, size, mimeType, status, reason, textChars }]
  attachments                JSONB NOT NULL DEFAULT '[]'::jsonb,
  classification             TEXT CHECK (classification IN (
                               'JOB_REQUIREMENT', 'JOB_UPDATE', 'CANDIDATE_SUBMISSION',
                               'GENERAL_RECRUITING', 'NON_RECRUITING', 'UNKNOWN')),
  classification_confidence  NUMERIC(4, 3),
  classification_source      TEXT CHECK (classification_source IN ('RULES', 'AI', 'RECRUITER')),
  classification_reasons     TEXT[] NOT NULL DEFAULT '{}',
  -- { fields: { title: { value, status: EXPLICIT|INFERRED|MISSING, evidence, source, confidence } ... } }
  extraction                 JSONB,
  extraction_model           TEXT,
  extracted_at               TIMESTAMPTZ,
  -- [{ kind, reference, detail }] deterministic duplicate signals for review
  duplicate_signals          JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Recruiter-edited draft values, kept separate from what the AI extracted.
  review_draft               JSONB,
  processing_status          TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (processing_status IN (
                               'RECEIVED', 'PROCESSING', 'REVIEW_REQUIRED', 'DRAFTED',
                               'LINKED', 'IGNORED', 'NOT_A_JOB', 'FAILED')),
  attempt_count              INTEGER NOT NULL DEFAULT 0,
  next_attempt_at            TIMESTAMPTZ,
  last_error                 TEXT,
  claimed_at                 TIMESTAMPTZ,
  claimed_by                 TEXT,
  linked_requisition_id      TEXT REFERENCES job_requisitions(id),
  linked_job_id              TEXT REFERENCES jobs(id),
  reviewed_by_profile_id     TEXT REFERENCES profiles(id),
  reviewed_at                TIMESTAMPTZ,
  review_note                TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_email_intake_provider_message
    UNIQUE (provider, provider_account_id, provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_email_intake_thread
  ON email_intake_messages (provider, provider_account_id, provider_thread_id);
CREATE INDEX IF NOT EXISTS idx_email_intake_status_received
  ON email_intake_messages (processing_status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_intake_retry
  ON email_intake_messages (next_attempt_at)
  WHERE processing_status IN ('RECEIVED', 'FAILED');
CREATE INDEX IF NOT EXISTS idx_email_intake_requisition
  ON email_intake_messages (linked_requisition_id)
  WHERE linked_requisition_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Intake audit trail (system + recruiter actions). Requisition-level events
--    are additionally written to recruiting_activities by application code.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_intake_events (
  id                 TEXT PRIMARY KEY,
  intake_message_id  TEXT REFERENCES email_intake_messages(id) ON DELETE CASCADE,
  source_id          TEXT REFERENCES email_intake_sources(id),
  event_type         TEXT NOT NULL,
  actor_type         TEXT NOT NULL CHECK (actor_type IN ('SYSTEM', 'RECRUITER')),
  actor_profile_id   TEXT REFERENCES profiles(id),
  requisition_id     TEXT REFERENCES job_requisitions(id),
  detail             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_intake_events_message
  ON email_intake_events (intake_message_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Public assistant rate limits (service role only; keys are salted hashes).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assistant_rate_limits (
  bucket        TEXT NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  hits          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS idx_assistant_rate_limits_window
  ON assistant_rate_limits (window_start);

CREATE OR REPLACE FUNCTION assistant_rate_limit_hit(
  p_bucket TEXT,
  p_window_seconds INTEGER,
  p_limit INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_hits INTEGER;
BEGIN
  IF p_window_seconds <= 0 OR p_limit <= 0 OR length(p_bucket) > 120 THEN
    RETURN FALSE;
  END IF;
  v_window := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO assistant_rate_limits (bucket, window_start, hits)
  VALUES (p_bucket, v_window, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET hits = assistant_rate_limits.hits + 1
  RETURNING hits INTO v_hits;

  -- Opportunistic cleanup of expired windows (~1% of calls).
  IF random() < 0.01 THEN
    DELETE FROM assistant_rate_limits WHERE window_start < now() - INTERVAL '2 days';
  END IF;

  RETURN v_hits <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION assistant_rate_limit_hit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION assistant_rate_limit_hit(TEXT, INTEGER, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION assistant_rate_limit_hit(TEXT, INTEGER, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Row level security: intake is recruiting-staff only; rate limits are
--    service-role only. Anonymous access to all four tables: none.
-- ---------------------------------------------------------------------------
ALTER TABLE email_intake_sources  ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_intake_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_intake_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON email_intake_sources, email_intake_messages, email_intake_events, assistant_rate_limits FROM anon;
REVOKE ALL ON assistant_rate_limits FROM authenticated;

DROP POLICY IF EXISTS email_intake_sources_recruiting_staff ON email_intake_sources;
CREATE POLICY email_intake_sources_recruiting_staff ON email_intake_sources
  FOR ALL USING (is_recruiting_staff()) WITH CHECK (is_recruiting_staff());

DROP POLICY IF EXISTS email_intake_messages_recruiting_staff ON email_intake_messages;
CREATE POLICY email_intake_messages_recruiting_staff ON email_intake_messages
  FOR ALL USING (is_recruiting_staff()) WITH CHECK (is_recruiting_staff());

DROP POLICY IF EXISTS email_intake_events_recruiting_staff ON email_intake_events;
CREATE POLICY email_intake_events_recruiting_staff ON email_intake_events
  FOR SELECT USING (is_recruiting_staff());
-- No INSERT/UPDATE/DELETE policy on events: the audit trail is written by the
-- server (service role) only and is append-only for authenticated users.

-- ---------------------------------------------------------------------------
-- 6. Resume profiles: one parse result per stored document. The original file
--    stays in private storage (documents / candidate-documents bucket); this
--    row holds the extracted text and the evidence-backed structured profile.
--    Historical application resumes keep their own rows — a newer upload
--    creates a new document and a new profile, never overwriting the old one.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resume_profiles (
  id              TEXT PRIMARY KEY,
  candidate_id    TEXT NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  document_id     TEXT NOT NULL REFERENCES documents(id),
  status          TEXT NOT NULL CHECK (status IN ('PARSED', 'FAILED', 'UNSUPPORTED')),
  parser_version  TEXT NOT NULL,
  extracted_text  TEXT,
  structured      JSONB,
  error           TEXT,
  parsed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_resume_profiles_document UNIQUE (document_id)
);

CREATE INDEX IF NOT EXISTS idx_resume_profiles_candidate
  ON resume_profiles (candidate_id, parsed_at DESC);

-- ---------------------------------------------------------------------------
-- 7. Detailed Apply snapshots: the candidate-reviewed profile submitted with
--    one application. Stored per application (not merged into the candidate's
--    canonical experience/education rows) so an anonymous submission can never
--    rewrite an existing candidate's profile.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS application_profile_snapshots (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  candidate_id    TEXT NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  source          TEXT NOT NULL CHECK (source IN ('DETAILED_APPLY')),
  profile         JSONB NOT NULL,
  answers         JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_application_profile_snapshot UNIQUE (application_id)
);

ALTER TABLE resume_profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_profile_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON resume_profiles, application_profile_snapshots FROM anon;

DROP POLICY IF EXISTS resume_profiles_recruiting_staff ON resume_profiles;
CREATE POLICY resume_profiles_recruiting_staff ON resume_profiles
  FOR SELECT USING (is_recruiting_staff());

DROP POLICY IF EXISTS application_profile_snapshots_recruiting_staff ON application_profile_snapshots;
CREATE POLICY application_profile_snapshots_recruiting_staff ON application_profile_snapshots
  FOR SELECT USING (is_recruiting_staff());
-- Writes come only from the server (service role) after authorization checks.
