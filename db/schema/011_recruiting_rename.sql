-- Unified ATS/HR data foundation, step 2 — recruiting domain.
-- candidates -> candidate_profiles, candidate_experience -> experiences,
-- candidate_education -> education, candidate_documents -> documents,
-- job_postings -> jobs. Adds skills (master list), application_documents
-- (join table), jd_analysis, resume_analysis.
--
-- job_requisitions is intentionally NOT renamed — it's the internal
-- draft/approval/salary/opening-count workflow behind a posting, which the
-- new schema's public-facing `jobs` table doesn't describe. `jobs` links
-- back to it via `requisition_id`, same as `job_postings` did.

ALTER TABLE candidates RENAME TO candidate_profiles;

ALTER TABLE candidate_profiles
  ADD COLUMN IF NOT EXISTS profile_id TEXT REFERENCES profiles(id);

-- Backfill the new forward link from the old reverse link
-- (profiles.candidate_id -> candidates.id) before dropping it.
UPDATE candidate_profiles cp
   SET profile_id = p.id
  FROM profiles p
 WHERE p.candidate_id = cp.id
   AND cp.profile_id IS NULL;

ALTER TABLE profiles DROP COLUMN IF EXISTS candidate_id;

ALTER TABLE candidate_experience RENAME TO experiences;
ALTER TABLE candidate_education RENAME TO education;

-- --- documents (was candidate_documents) -----------------------------------

ALTER TABLE candidate_documents RENAME TO documents;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS file_size INTEGER;

UPDATE documents d
   SET user_id = cp.profile_id
  FROM candidate_profiles cp
 WHERE cp.id = d.candidate_id
   AND d.user_id IS NULL;

-- One document (e.g. a resume) can be attached to more than one application.
CREATE TABLE IF NOT EXISTS application_documents (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (application_id, document_id)
);

-- Carry forward the existing (unconstrained) documents.application_id links
-- so nothing already associated with an application loses that association.
INSERT INTO application_documents (id, application_id, document_id, created_at)
SELECT 'appdoc-' || gen_random_uuid(), d.application_id, d.id, d.uploaded_at
  FROM documents d
 WHERE d.application_id IS NOT NULL
ON CONFLICT (application_id, document_id) DO NOTHING;

ALTER TABLE documents DROP COLUMN IF EXISTS application_id;

-- --- skills / candidate_skills ----------------------------------------------

CREATE TABLE IF NOT EXISTS skills (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  category   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- candidate_skills currently stores free-text `skill`; normalize it against
-- the new master `skills` list via a `skill_id` FK, one row per distinct
-- skill name (case-insensitive).
INSERT INTO skills (id, name)
SELECT 'skill-' || gen_random_uuid(), s.name
  FROM (SELECT DISTINCT trim(skill) AS name FROM candidate_skills WHERE trim(skill) <> '') s
ON CONFLICT (name) DO NOTHING;

ALTER TABLE candidate_skills
  ADD COLUMN IF NOT EXISTS skill_id TEXT REFERENCES skills(id);

UPDATE candidate_skills cs
   SET skill_id = s.id
  FROM skills s
 WHERE lower(s.name) = lower(trim(cs.skill))
   AND cs.skill_id IS NULL;

ALTER TABLE candidate_skills
  ALTER COLUMN skill_id SET NOT NULL,
  DROP COLUMN IF EXISTS skill;

DO $$
BEGIN
  ALTER TABLE candidate_skills
    ADD CONSTRAINT uq_candidate_skills UNIQUE (candidate_id, skill_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- job_skills: required/preferred skills per job posting (new — nothing to
-- backfill since job postings never captured structured skills before).
CREATE TABLE IF NOT EXISTS job_skills (
  id       TEXT PRIMARY KEY,
  job_id   TEXT NOT NULL,
  skill_id TEXT NOT NULL REFERENCES skills(id),
  required BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (job_id, skill_id)
);

-- --- jobs (was job_postings) ------------------------------------------------

ALTER TABLE job_postings RENAME TO jobs;

ALTER TABLE applications RENAME COLUMN posting_id TO job_id;

-- job_skills.job_id couldn't reference `jobs(id)` above (jobs didn't exist
-- as that name yet); add the FK now that it does.
ALTER TABLE job_skills
  ADD CONSTRAINT fk_job_skills_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;

-- --- jd_analysis / resume_analysis ------------------------------------------

CREATE TABLE IF NOT EXISTS jd_analysis (
  id                  TEXT PRIMARY KEY,
  job_id              TEXT REFERENCES jobs(id),
  candidate_id        TEXT REFERENCES candidate_profiles(id),
  resume_document_id  TEXT REFERENCES documents(id),
  analysis_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_score          NUMERIC,
  matched_skills        JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_skills        JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jd_analysis_job ON jd_analysis(job_id);
CREATE INDEX IF NOT EXISTS idx_jd_analysis_candidate ON jd_analysis(candidate_id);

-- Same shape as jd_analysis, scoped to one resume <-> one job match rather
-- than a standalone JD parse (kept separate since the spec lists both).
CREATE TABLE IF NOT EXISTS resume_analysis (
  id                  TEXT PRIMARY KEY,
  job_id              TEXT REFERENCES jobs(id),
  candidate_id        TEXT REFERENCES candidate_profiles(id),
  resume_document_id  TEXT NOT NULL REFERENCES documents(id),
  analysis_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_score          NUMERIC,
  matched_skills        JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_skills        JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_analysis_job ON resume_analysis(job_id);
CREATE INDEX IF NOT EXISTS idx_resume_analysis_candidate ON resume_analysis(candidate_id);
