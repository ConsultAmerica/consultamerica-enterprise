-- ConsultAmerica Phase 2A — Recruiting / ATS Schema
-- Rule: Candidate → Offer Accepted → Hire → Employee (Phase 3)

CREATE TABLE IF NOT EXISTS job_requisitions (
  id                          TEXT PRIMARY KEY,
  requisition_number          TEXT NOT NULL UNIQUE,
  title                       TEXT NOT NULL,
  department_id               TEXT NOT NULL REFERENCES departments(id),
  position_id                 TEXT NOT NULL REFERENCES positions(id),
  location_id                 TEXT NOT NULL REFERENCES locations(id),
  hiring_manager_user_id      TEXT,
  recruiter_user_id           TEXT,
  employment_type             TEXT NOT NULL CHECK (
    employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY')
  ),
  workplace_type              TEXT NOT NULL CHECK (
    workplace_type IN ('REMOTE', 'HYBRID', 'ONSITE')
  ),
  career_area                 TEXT NOT NULL,
  openings                    INTEGER NOT NULL DEFAULT 1 CHECK (openings > 0),
  salary_min                  NUMERIC,
  salary_max                  NUMERIC,
  currency                    TEXT NOT NULL DEFAULT 'USD',
  description                 TEXT NOT NULL,
  responsibilities            JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualifications              JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_qualifications    JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_hire_date            DATE,
  status                      TEXT NOT NULL CHECK (
    status IN (
      'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED',
      'PUBLISHED', 'ON_HOLD', 'FILLED', 'CANCELLED'
    )
  ),
  created_by_user_id          TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_requisition_approvals (
  id                TEXT PRIMARY KEY,
  requisition_id    TEXT NOT NULL REFERENCES job_requisitions(id),
  approver_user_id  TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (
    status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')
  ),
  comments          TEXT,
  decided_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_postings (
  id                          TEXT PRIMARY KEY,
  requisition_id              TEXT NOT NULL REFERENCES job_requisitions(id),
  slug                        TEXT NOT NULL UNIQUE,
  title                       TEXT NOT NULL,
  summary                     TEXT NOT NULL,
  description                 TEXT NOT NULL,
  career_area                 TEXT NOT NULL,
  department_name             TEXT NOT NULL,
  location_name               TEXT NOT NULL,
  workplace_type              TEXT NOT NULL CHECK (
    workplace_type IN ('REMOTE', 'HYBRID', 'ONSITE')
  ),
  employment_type             TEXT NOT NULL CHECK (
    employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY')
  ),
  responsibilities            JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualifications              JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_qualifications    JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                      TEXT NOT NULL CHECK (
    status IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'CLOSED')
  ),
  published_at                TIMESTAMPTZ,
  closed_at                   TIMESTAMPTZ,
  is_demo                     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_postings_status ON job_postings(status);
CREATE INDEX IF NOT EXISTS idx_job_postings_career_area ON job_postings(career_area);

CREATE TABLE IF NOT EXISTS candidates (
  id                   TEXT PRIMARY KEY,
  first_name           TEXT NOT NULL,
  last_name            TEXT NOT NULL,
  preferred_name       TEXT,
  email                TEXT NOT NULL UNIQUE,
  phone                TEXT,
  linkedin_url         TEXT,
  portfolio_url        TEXT,
  work_authorization   TEXT,
  willing_to_relocate  BOOLEAN,
  source               TEXT,
  person_id            TEXT,
  employee_id          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidate_addresses (
  id               TEXT PRIMARY KEY,
  candidate_id     TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  address_line_1   TEXT NOT NULL,
  address_line_2   TEXT,
  city             TEXT NOT NULL,
  state            TEXT,
  postal_code      TEXT,
  country          TEXT NOT NULL,
  is_primary       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS candidate_experience (
  id               TEXT PRIMARY KEY,
  candidate_id     TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  company          TEXT NOT NULL,
  title            TEXT NOT NULL,
  start_date       DATE NOT NULL,
  end_date         DATE,
  is_current       BOOLEAN NOT NULL DEFAULT FALSE,
  description      TEXT
);

CREATE TABLE IF NOT EXISTS candidate_education (
  id               TEXT PRIMARY KEY,
  candidate_id     TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  institution      TEXT NOT NULL,
  degree           TEXT,
  field_of_study   TEXT,
  start_date       DATE,
  end_date         DATE
);

CREATE TABLE IF NOT EXISTS candidate_skills (
  id               TEXT PRIMARY KEY,
  candidate_id     TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  skill            TEXT NOT NULL,
  proficiency      TEXT
);

CREATE TABLE IF NOT EXISTS candidate_documents (
  id               TEXT PRIMARY KEY,
  candidate_id     TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  application_id   TEXT,
  document_type    TEXT NOT NULL CHECK (
    document_type IN ('RESUME', 'COVER_LETTER', 'PORTFOLIO', 'OTHER')
  ),
  file_name        TEXT NOT NULL,
  storage_path     TEXT NOT NULL,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applications (
  id                       TEXT PRIMARY KEY,
  application_number       TEXT NOT NULL UNIQUE,
  candidate_id             TEXT NOT NULL REFERENCES candidates(id),
  requisition_id           TEXT NOT NULL REFERENCES job_requisitions(id),
  posting_id               TEXT NOT NULL REFERENCES job_postings(id),
  status                   TEXT NOT NULL CHECK (
    status IN (
      'APPLIED', 'REVIEW', 'RECRUITER_SCREEN', 'HIRING_MANAGER_REVIEW',
      'INTERVIEW', 'FINAL_INTERVIEW', 'OFFER', 'HIRED',
      'REJECTED', 'WITHDRAWN', 'CLOSED'
    )
  ),
  cover_letter             TEXT,
  additional_information   TEXT,
  applied_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (candidate_id, requisition_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_requisition ON applications(requisition_id);

CREATE TABLE IF NOT EXISTS application_status_history (
  id                   TEXT PRIMARY KEY,
  application_id       TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  from_status          TEXT,
  to_status            TEXT NOT NULL,
  changed_by_user_id   TEXT,
  note                 TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interviews (
  id                   TEXT PRIMARY KEY,
  application_id       TEXT NOT NULL REFERENCES applications(id),
  interview_type       TEXT NOT NULL CHECK (
    interview_type IN (
      'PHONE_SCREEN', 'VIDEO', 'ONSITE', 'PANEL', 'TECHNICAL', 'FINAL'
    )
  ),
  status               TEXT NOT NULL CHECK (
    status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')
  ),
  scheduled_at         TIMESTAMPTZ NOT NULL,
  duration_minutes     INTEGER NOT NULL DEFAULT 60,
  location_or_link     TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interview_panel_members (
  id               TEXT PRIMARY KEY,
  interview_id     TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('INTERVIEWER', 'LEAD', 'OBSERVER'))
);

CREATE TABLE IF NOT EXISTS interview_feedback (
  id                   TEXT PRIMARY KEY,
  interview_id         TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  panel_member_id      TEXT NOT NULL REFERENCES interview_panel_members(id),
  recommendation       TEXT NOT NULL CHECK (
    recommendation IN ('STRONG_YES', 'YES', 'NEUTRAL', 'NO', 'STRONG_NO')
  ),
  score                NUMERIC,
  strengths            TEXT,
  concerns             TEXT,
  notes                TEXT,
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offers (
  id                   TEXT PRIMARY KEY,
  application_id       TEXT NOT NULL REFERENCES applications(id),
  offer_number         TEXT NOT NULL UNIQUE,
  status               TEXT NOT NULL CHECK (
    status IN (
      'DRAFT', 'PENDING_APPROVAL', 'EXTENDED',
      'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED'
    )
  ),
  base_salary          NUMERIC,
  hourly_rate          NUMERIC,
  currency             TEXT NOT NULL DEFAULT 'USD',
  employment_type      TEXT NOT NULL,
  workplace_type       TEXT NOT NULL,
  start_date           DATE NOT NULL,
  expiration_date      DATE,
  terms_summary        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offer_approvals (
  id                TEXT PRIMARY KEY,
  offer_id          TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  approver_user_id  TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (
    status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')
  ),
  comments          TEXT,
  decided_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recruiting_notes (
  id                   TEXT PRIMARY KEY,
  candidate_id         TEXT REFERENCES candidates(id),
  application_id       TEXT REFERENCES applications(id),
  requisition_id       TEXT REFERENCES job_requisitions(id),
  visibility           TEXT NOT NULL CHECK (
    visibility IN ('RECRUITER', 'HIRING_TEAM', 'HR')
  ),
  note                 TEXT NOT NULL,
  created_by_user_id   TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recruiting_activities (
  id                   TEXT PRIMARY KEY,
  candidate_id         TEXT REFERENCES candidates(id),
  application_id       TEXT REFERENCES applications(id),
  requisition_id       TEXT REFERENCES job_requisitions(id),
  activity_type        TEXT NOT NULL,
  summary              TEXT NOT NULL,
  created_by_user_id   TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Future Phase 3 bridge columns (person_id / employee_id) live on candidates.
-- Hire conversion must create Person + Employee + Assignment, not duplicate people.
