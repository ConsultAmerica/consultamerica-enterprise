-- Integration-test bootstrap (LOCAL / ISOLATED DATABASE ONLY — never production).
--
-- Recreates the prerequisite tables this repository's migrations build on,
-- with the column sets read from production's PostgREST schema on
-- 2026-10-07 (profiles, user_roles, candidate_profiles, job_requisitions,
-- jobs, applications, documents, application_documents, …). Migrations
-- 001–044 live partly in consultamerica-functional-source; tests/integration/
-- setup-db.mjs then applies the REAL text of 019 (helpers, document and
-- storage policies), 014 (buckets/staff read), 045, 046 and 048 on top.

CREATE TABLE IF NOT EXISTS profiles (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  status        TEXT,
  auth_user_id  UUID UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  id       TEXT PRIMARY KEY,
  user_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidate_profiles (
  id                    TEXT PRIMARY KEY,
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  preferred_name        TEXT,
  email                 TEXT NOT NULL UNIQUE,
  phone                 TEXT,
  linkedin_url          TEXT,
  portfolio_url         TEXT,
  work_authorization    TEXT,
  willing_to_relocate   BOOLEAN,
  source                TEXT,
  profile_id            TEXT REFERENCES profiles(id),
  city                  TEXT,
  state                 TEXT,
  professional_summary  TEXT,
  github_url            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_requisitions (
  id                        TEXT PRIMARY KEY,
  requisition_number        TEXT,
  title                     TEXT NOT NULL,
  hiring_manager_user_id    TEXT,
  recruiter_user_id         TEXT,
  employment_type           TEXT,
  workplace_type            TEXT,
  career_area               TEXT,
  openings                  INTEGER,
  description               TEXT,
  responsibilities          JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualifications            JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_qualifications  JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                    TEXT NOT NULL DEFAULT 'OPEN',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Production `jobs` (job_postings renamed in 011, 043 columns, no 044 columns).
CREATE TABLE IF NOT EXISTS jobs (
  id                        TEXT PRIMARY KEY,
  requisition_id            TEXT NOT NULL REFERENCES job_requisitions(id),
  slug                      TEXT NOT NULL UNIQUE,
  title                     TEXT NOT NULL,
  summary                   TEXT NOT NULL DEFAULT '',
  description               TEXT NOT NULL DEFAULT '',
  career_area               TEXT NOT NULL DEFAULT 'consulting',
  department_name           TEXT NOT NULL DEFAULT 'Consulting',
  location_name             TEXT NOT NULL DEFAULT 'Remote',
  workplace_type            TEXT NOT NULL DEFAULT 'REMOTE',
  employment_type           TEXT NOT NULL DEFAULT 'FULL_TIME',
  responsibilities          JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualifications            JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_qualifications  JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                    TEXT NOT NULL,
  published_at              TIMESTAMPTZ,
  closed_at                 TIMESTAMPTZ,
  is_demo                   BOOLEAN NOT NULL DEFAULT false,
  publish_at                TIMESTAMPTZ,
  expires_at                TIMESTAMPTZ,
  application_deadline      TIMESTAMPTZ,
  featured                  BOOLEAN NOT NULL DEFAULT false,
  experience_level          TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id                      TEXT PRIMARY KEY,
  application_number      TEXT NOT NULL UNIQUE,
  candidate_id            TEXT NOT NULL REFERENCES candidate_profiles(id),
  requisition_id          TEXT NOT NULL REFERENCES job_requisitions(id),
  job_id                  TEXT REFERENCES jobs(id),
  status                  TEXT NOT NULL,
  cover_letter            TEXT,
  additional_information  TEXT,
  applied_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, requisition_id)
);

CREATE TABLE IF NOT EXISTS documents (
  id                 TEXT PRIMARY KEY,
  candidate_id       TEXT NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  document_type      TEXT NOT NULL,
  file_name          TEXT NOT NULL,
  storage_path       TEXT NOT NULL,
  uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id            TEXT REFERENCES profiles(id),
  mime_type          TEXT,
  file_size          INTEGER,
  is_primary_resume  BOOLEAN NOT NULL DEFAULT false,
  status             TEXT NOT NULL DEFAULT 'ACTIVE',
  updated_at         TIMESTAMPTZ,
  archived_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS application_documents (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  purpose         TEXT,
  document_role   TEXT DEFAULT 'OTHER',
  attached_at     TIMESTAMPTZ DEFAULT now()
);
-- 018 / 020 constraints that guard submitted résumé lineage.
CREATE UNIQUE INDEX IF NOT EXISTS uq_application_documents_app_doc_role
  ON application_documents (application_id, document_id, document_role);
CREATE UNIQUE INDEX IF NOT EXISTS uq_application_documents_one_resume
  ON application_documents (application_id) WHERE document_role = 'RESUME';

CREATE TABLE IF NOT EXISTS application_status_history (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recruiting_activities (
  id              TEXT PRIMARY KEY,
  candidate_id    TEXT,
  application_id  TEXT,
  requisition_id  TEXT,
  activity_type   TEXT NOT NULL,
  summary         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tables 019's helper bodies reference (not otherwise used by these tests).
CREATE TABLE IF NOT EXISTS employee_profiles (id TEXT PRIMARY KEY, user_id TEXT);
CREATE TABLE IF NOT EXISTS job_assignments (
  id TEXT PRIMARY KEY, employee_id TEXT, manager_employee_id TEXT, assignment_status TEXT
);

ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_requisitions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_documents  ENABLE ROW LEVEL SECURITY;

-- 019's default privileges: authenticated may attempt writes; RLS decides.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON jobs TO anon;
