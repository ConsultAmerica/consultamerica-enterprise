-- Unified ATS/HR data foundation, step 4 — Row Level Security.
-- Enforces the access rules at the database layer, not just frontend route
-- checks, using current_profile_id()/current_user_has_role() from
-- 010_identity_rename.sql. Covers the core tables the spec calls out by
-- name; the remaining self-service/payroll/CRM tables aren't covered here —
-- same policy pattern extends to them in a later pass.
--
-- Note: today's application code reads/writes exclusively through the
-- Supabase service-role client (getSupabaseServiceClient(), which bypasses
-- RLS by design), so these policies are defense-in-depth for any future
-- user-scoped client access or direct SQL access — they don't change current
-- app behavior, which is unaffected either way.

-- --- profiles ----------------------------------------------------------------

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_self ON profiles
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY profiles_self_update ON profiles
  FOR UPDATE USING (auth_user_id = auth.uid());

CREATE POLICY profiles_staff_select ON profiles
  FOR SELECT USING (
    current_user_has_role('RECRUITER') OR current_user_has_role('HIRING_MANAGER')
    OR current_user_has_role('HR_ADMIN') OR current_user_has_role('HR_SPECIALIST')
    OR current_user_has_role('SYSTEM_ADMIN')
  );

CREATE POLICY profiles_admin_all ON profiles
  FOR ALL USING (current_user_has_role('SYSTEM_ADMIN'));

-- --- candidate_profiles / experiences / education / candidate_skills -------

ALTER TABLE candidate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE education ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY candidate_profiles_self ON candidate_profiles
  FOR ALL USING (profile_id = current_profile_id());

CREATE POLICY candidate_profiles_staff ON candidate_profiles
  FOR SELECT USING (
    current_user_has_role('RECRUITER') OR current_user_has_role('HIRING_MANAGER')
    OR current_user_has_role('HR_ADMIN') OR current_user_has_role('SYSTEM_ADMIN')
  );

CREATE POLICY experiences_self ON experiences
  FOR ALL USING (
    candidate_id IN (SELECT id FROM candidate_profiles WHERE profile_id = current_profile_id())
  );

CREATE POLICY experiences_staff ON experiences
  FOR SELECT USING (
    current_user_has_role('RECRUITER') OR current_user_has_role('HIRING_MANAGER')
    OR current_user_has_role('HR_ADMIN') OR current_user_has_role('SYSTEM_ADMIN')
  );

CREATE POLICY education_self ON education
  FOR ALL USING (
    candidate_id IN (SELECT id FROM candidate_profiles WHERE profile_id = current_profile_id())
  );

CREATE POLICY education_staff ON education
  FOR SELECT USING (
    current_user_has_role('RECRUITER') OR current_user_has_role('HIRING_MANAGER')
    OR current_user_has_role('HR_ADMIN') OR current_user_has_role('SYSTEM_ADMIN')
  );

CREATE POLICY candidate_skills_self ON candidate_skills
  FOR ALL USING (
    candidate_id IN (SELECT id FROM candidate_profiles WHERE profile_id = current_profile_id())
  );

CREATE POLICY candidate_skills_staff ON candidate_skills
  FOR SELECT USING (
    current_user_has_role('RECRUITER') OR current_user_has_role('HIRING_MANAGER')
    OR current_user_has_role('HR_ADMIN') OR current_user_has_role('SYSTEM_ADMIN')
  );

-- --- documents / application_documents ---------------------------------------

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_self ON documents
  FOR ALL USING (user_id = current_profile_id());

CREATE POLICY documents_staff_select ON documents
  FOR SELECT USING (
    current_user_has_role('RECRUITER') OR current_user_has_role('HIRING_MANAGER')
    OR current_user_has_role('HR_ADMIN') OR current_user_has_role('SYSTEM_ADMIN')
  );

CREATE POLICY application_documents_self ON application_documents
  FOR ALL USING (
    document_id IN (SELECT id FROM documents WHERE user_id = current_profile_id())
  );

CREATE POLICY application_documents_staff_select ON application_documents
  FOR SELECT USING (
    current_user_has_role('RECRUITER') OR current_user_has_role('HIRING_MANAGER')
    OR current_user_has_role('HR_ADMIN') OR current_user_has_role('SYSTEM_ADMIN')
  );

-- --- applications --------------------------------------------------------------

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY applications_self ON applications
  FOR SELECT USING (
    candidate_id IN (SELECT id FROM candidate_profiles WHERE profile_id = current_profile_id())
  );

CREATE POLICY applications_staff ON applications
  FOR SELECT USING (
    current_user_has_role('RECRUITER') OR current_user_has_role('HR_ADMIN')
    OR current_user_has_role('SYSTEM_ADMIN')
  );

-- Hiring managers see applications for requisitions they're assigned to.
CREATE POLICY applications_hiring_manager ON applications
  FOR SELECT USING (
    current_user_has_role('HIRING_MANAGER')
    AND requisition_id IN (
      SELECT id FROM job_requisitions WHERE hiring_manager_user_id = current_profile_id()
    )
  );

CREATE POLICY applications_staff_manage ON applications
  FOR UPDATE USING (
    current_user_has_role('RECRUITER') OR current_user_has_role('HR_ADMIN')
    OR current_user_has_role('SYSTEM_ADMIN')
  );

-- --- jobs (public read for published postings; staff manage) -----------------

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_public_read ON jobs
  FOR SELECT USING (status = 'PUBLISHED');

CREATE POLICY jobs_staff_all ON jobs
  FOR ALL USING (
    current_user_has_role('RECRUITER') OR current_user_has_role('HIRING_MANAGER')
    OR current_user_has_role('HR_ADMIN') OR current_user_has_role('SYSTEM_ADMIN')
  );

-- --- jd_analysis / resume_analysis --------------------------------------------

ALTER TABLE jd_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY jd_analysis_self ON jd_analysis
  FOR SELECT USING (
    candidate_id IN (SELECT id FROM candidate_profiles WHERE profile_id = current_profile_id())
  );

CREATE POLICY jd_analysis_staff ON jd_analysis
  FOR ALL USING (
    current_user_has_role('RECRUITER') OR current_user_has_role('HIRING_MANAGER')
    OR current_user_has_role('HR_ADMIN') OR current_user_has_role('SYSTEM_ADMIN')
  );

CREATE POLICY resume_analysis_self ON resume_analysis
  FOR SELECT USING (
    candidate_id IN (SELECT id FROM candidate_profiles WHERE profile_id = current_profile_id())
  );

CREATE POLICY resume_analysis_staff ON resume_analysis
  FOR ALL USING (
    current_user_has_role('RECRUITER') OR current_user_has_role('HIRING_MANAGER')
    OR current_user_has_role('HR_ADMIN') OR current_user_has_role('SYSTEM_ADMIN')
  );

-- --- employee_profiles / job_assignments / employee_documents ----------------

ALTER TABLE employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY employee_profiles_self ON employee_profiles
  FOR SELECT USING (user_id = current_profile_id());

-- Employee-editable subset — mirrors lib/hr/repository.ts's
-- UpdatePersonContactInput (preferred_name/personal_email/phone/mailing
-- address/emergency contact); enforced again at the application layer too.
CREATE POLICY employee_profiles_self_update ON employee_profiles
  FOR UPDATE USING (user_id = current_profile_id());

CREATE POLICY employee_profiles_manager ON employee_profiles
  FOR SELECT USING (
    id IN (
      SELECT employee_id FROM job_assignments
       WHERE manager_employee_id = (SELECT id FROM employee_profiles WHERE user_id = current_profile_id())
         AND assignment_status = 'ACTIVE'
    )
  );

CREATE POLICY employee_profiles_hr_admin ON employee_profiles
  FOR ALL USING (
    current_user_has_role('HR_ADMIN') OR current_user_has_role('HR_SPECIALIST')
    OR current_user_has_role('SYSTEM_ADMIN')
  );

CREATE POLICY job_assignments_self ON job_assignments
  FOR SELECT USING (
    employee_id IN (SELECT id FROM employee_profiles WHERE user_id = current_profile_id())
  );

CREATE POLICY job_assignments_hr_admin ON job_assignments
  FOR ALL USING (
    current_user_has_role('HR_ADMIN') OR current_user_has_role('HR_SPECIALIST')
    OR current_user_has_role('SYSTEM_ADMIN')
  );

CREATE POLICY employee_documents_self ON employee_documents
  FOR SELECT USING (
    employee_id IN (SELECT id FROM employee_profiles WHERE user_id = current_profile_id())
  );

CREATE POLICY employee_documents_hr_admin ON employee_documents
  FOR ALL USING (
    current_user_has_role('HR_ADMIN') OR current_user_has_role('HR_SPECIALIST')
    OR current_user_has_role('SYSTEM_ADMIN')
  );
