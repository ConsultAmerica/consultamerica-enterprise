-- Benefits captured on the job form. The requisition holds what the recruiter
-- entered; the posting holds what the public page renders, matching how
-- responsibilities/qualifications are already duplicated across the two.
-- TEXT[] (not JSONB) to match the `skills` array added in 044.
--
-- NOTE: the public posting table is `jobs` — it was renamed from
-- `job_postings` in 011_recruiting_rename.sql.
--
-- Until this migration is applied, benefits writes are a logged no-op:
-- lib/recruiting/supabase-repository.ts::writeBenefits swallows PostgREST's
-- missing-column error (42703 / PGRST204) so the job still saves. Apply it to
-- actually persist benefits.

ALTER TABLE job_requisitions
  ADD COLUMN IF NOT EXISTS benefits TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS benefits TEXT[] NOT NULL DEFAULT '{}';
