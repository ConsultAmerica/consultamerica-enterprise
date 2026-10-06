-- Unified ATS/HR data foundation, step 5 — Storage buckets.
-- Four private buckets, no public bucket. Convention: every object is
-- stored at path `{profile_id}/{filename}` so ownership can be checked from
-- the path alone via storage.foldername(name)[1], without a join back into
-- app tables. Application upload code (Phase 4, not part of this pass) must
-- follow that path convention for these policies to work.

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('candidate-resumes', 'candidate-resumes', false),
  ('candidate-documents', 'candidate-documents', false),
  ('employee-documents', 'employee-documents', false),
  ('job-assets', 'job-assets', false)
ON CONFLICT (id) DO NOTHING;

-- --- candidate-resumes / candidate-documents ----------------------------------
-- Owner (the candidate whose profile_id prefixes the path) plus recruiting
-- staff can read; only the owner can write their own files.

DROP POLICY IF EXISTS candidate_resumes_owner_rw ON storage.objects;
CREATE POLICY candidate_resumes_owner_rw ON storage.objects
  FOR ALL USING (
    bucket_id = 'candidate-resumes'
    AND (storage.foldername(name))[1] = current_profile_id()
  );

DROP POLICY IF EXISTS candidate_resumes_staff_read ON storage.objects;
CREATE POLICY candidate_resumes_staff_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'candidate-resumes'
    AND (
      current_user_has_role('RECRUITER') OR current_user_has_role('HIRING_MANAGER')
      OR current_user_has_role('HR_ADMIN') OR current_user_has_role('SYSTEM_ADMIN')
    )
  );

DROP POLICY IF EXISTS candidate_documents_owner_rw ON storage.objects;
CREATE POLICY candidate_documents_owner_rw ON storage.objects
  FOR ALL USING (
    bucket_id = 'candidate-documents'
    AND (storage.foldername(name))[1] = current_profile_id()
  );

DROP POLICY IF EXISTS candidate_documents_staff_read ON storage.objects;
CREATE POLICY candidate_documents_staff_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'candidate-documents'
    AND (
      current_user_has_role('RECRUITER') OR current_user_has_role('HIRING_MANAGER')
      OR current_user_has_role('HR_ADMIN') OR current_user_has_role('SYSTEM_ADMIN')
    )
  );

-- --- employee-documents ---------------------------------------------------------
-- Owner can read (not write — HR issues these, e.g. offer letters, policy
-- acknowledgements); HR/system admin manage.

DROP POLICY IF EXISTS employee_documents_owner_read ON storage.objects;
CREATE POLICY employee_documents_owner_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'employee-documents'
    AND (storage.foldername(name))[1] = current_profile_id()
  );

DROP POLICY IF EXISTS employee_documents_hr_admin_manage ON storage.objects;
CREATE POLICY employee_documents_hr_admin_manage ON storage.objects
  FOR ALL USING (
    bucket_id = 'employee-documents'
    AND (
      current_user_has_role('HR_ADMIN') OR current_user_has_role('HR_SPECIALIST')
      OR current_user_has_role('SYSTEM_ADMIN')
    )
  );

-- --- job-assets -------------------------------------------------------------------
-- Recruiting/HR staff manage (job posting images, attachments); public read
-- since published job assets are shown on the public careers site — the
-- object path convention there is job-id-prefixed, not profile-id-prefixed,
-- so no owner-based policy applies here.

DROP POLICY IF EXISTS job_assets_public_read ON storage.objects;
CREATE POLICY job_assets_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'job-assets');

DROP POLICY IF EXISTS job_assets_staff_manage ON storage.objects;
CREATE POLICY job_assets_staff_manage ON storage.objects
  FOR ALL USING (
    bucket_id = 'job-assets'
    AND (
      current_user_has_role('RECRUITER') OR current_user_has_role('HIRING_MANAGER')
      OR current_user_has_role('HR_ADMIN') OR current_user_has_role('SYSTEM_ADMIN')
    )
  );
