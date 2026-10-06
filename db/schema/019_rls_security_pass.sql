-- Security pass: default-deny Row Level Security for every public application
-- table, plus least-privilege grants and storage ownership.
--
-- Does not drop tables, delete rows, or make buckets public.
-- Service role bypasses RLS and remains the app's server-side writer.
-- Anon is limited to SELECT on published jobs.

-- ---------------------------------------------------------------------------
-- Identity helpers (SECURITY DEFINER, locked search_path)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_profile_id() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM profiles WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION current_user_has_role(p_role TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_roles ur
      JOIN profiles p ON p.id = ur.user_id
     WHERE p.auth_user_id = auth.uid()
       AND ur.role = p_role
  );
$$;

CREATE OR REPLACE FUNCTION current_candidate_id() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
    FROM candidate_profiles
   WHERE profile_id = current_profile_id()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION current_employee_id() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
    FROM employee_profiles
   WHERE user_id = current_profile_id()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_recruiting_staff() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT current_user_has_role('RECRUITER')
      OR current_user_has_role('HR_ADMIN')
      OR current_user_has_role('HR_SPECIALIST')
      OR current_user_has_role('SYSTEM_ADMIN');
$$;

CREATE OR REPLACE FUNCTION is_hiring_manager() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT current_user_has_role('HIRING_MANAGER');
$$;

CREATE OR REPLACE FUNCTION is_hr_staff() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT current_user_has_role('HR_ADMIN')
      OR current_user_has_role('HR_SPECIALIST')
      OR current_user_has_role('SYSTEM_ADMIN');
$$;

CREATE OR REPLACE FUNCTION is_payroll_staff() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT current_user_has_role('PAYROLL_ADMIN')
      OR current_user_has_role('HR_ADMIN')
      OR current_user_has_role('SYSTEM_ADMIN');
$$;

CREATE OR REPLACE FUNCTION is_people_manager() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT current_user_has_role('MANAGER')
      OR current_user_has_role('HIRING_MANAGER')
      OR current_user_has_role('HR_ADMIN')
      OR current_user_has_role('SYSTEM_ADMIN');
$$;

CREATE OR REPLACE FUNCTION is_sales_staff() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT current_user_has_role('SALES_REP')
      OR current_user_has_role('SALES_MANAGER')
      OR current_user_has_role('SYSTEM_ADMIN');
$$;

CREATE OR REPLACE FUNCTION manages_employee(p_employee_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM job_assignments a
     WHERE a.employee_id = p_employee_id
       AND a.manager_employee_id = current_employee_id()
       AND a.assignment_status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION hiring_manager_sees_application(p_application_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM applications a
      JOIN job_requisitions r ON r.id = a.requisition_id
     WHERE a.id = p_application_id
       AND r.hiring_manager_user_id = current_profile_id()
  );
$$;

REVOKE ALL ON FUNCTION current_profile_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_profile_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION current_user_has_role(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION current_candidate_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION current_employee_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_recruiting_staff() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_hiring_manager() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_hr_staff() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_payroll_staff() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_people_manager() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_sales_staff() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manages_employee(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION hiring_manager_sees_application(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS on every application table that was still open
-- ---------------------------------------------------------------------------

ALTER TABLE public.application_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_request_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_panel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_requisition_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_request_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruiting_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruiting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Already enabled in 013; reaffirm so a partial apply stays closed.
ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jd_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jd_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_analysis ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Grants: revoke the default "publicly accessible" privileges, then re-grant
-- only what policies are allowed to evaluate.
-- ---------------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT EXECUTE ON FUNCTION current_profile_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION current_user_has_role(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION current_candidate_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION current_employee_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_recruiting_staff() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_hiring_manager() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_hr_staff() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_payroll_staff() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_people_manager() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_sales_staff() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION manages_employee(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION hiring_manager_sees_application(TEXT) TO anon, authenticated;

-- Anonymous: published jobs only. No insert/update/delete.
GRANT SELECT ON public.jobs TO anon;

-- Authenticated callers are still filtered by RLS. No TRUNCATE.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Compatibility view is read-only and must not bypass documents RLS.
REVOKE ALL ON TABLE public.candidate_documents FROM anon, authenticated;
GRANT SELECT ON public.candidate_documents TO authenticated;

ALTER VIEW public.candidate_documents SET (security_invoker = true);

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- ---------------------------------------------------------------------------
-- Tighten existing owner policies (ownership from auth.uid(), not a client id)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS documents_self ON public.documents;
CREATE POLICY documents_self ON public.documents
  FOR ALL
  TO authenticated
  USING (
    user_id = current_profile_id()
    OR candidate_id = current_candidate_id()
  )
  WITH CHECK (
    user_id = current_profile_id()
    OR candidate_id = current_candidate_id()
  );

DROP POLICY IF EXISTS application_documents_self ON public.application_documents;
CREATE POLICY application_documents_self ON public.application_documents
  FOR ALL
  TO authenticated
  USING (
    document_id IN (
      SELECT id FROM documents
       WHERE user_id = current_profile_id()
          OR candidate_id = current_candidate_id()
    )
  )
  WITH CHECK (
    document_id IN (
      SELECT id FROM documents
       WHERE user_id = current_profile_id()
          OR candidate_id = current_candidate_id()
    )
  );

DROP POLICY IF EXISTS employee_documents_self ON public.employee_documents;
CREATE POLICY employee_documents_self ON public.employee_documents
  FOR SELECT
  TO authenticated
  USING (
    employee_id = current_employee_id()
    AND visibility IN ('EMPLOYEE', 'MANAGER_AND_HR')
  );

-- ---------------------------------------------------------------------------
-- Recruiting records that were previously world-readable
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS application_status_history_self ON public.application_status_history;
CREATE POLICY application_status_history_self ON public.application_status_history
  FOR SELECT
  TO authenticated
  USING (
    application_id IN (
      SELECT id FROM applications WHERE candidate_id = current_candidate_id()
    )
  );

DROP POLICY IF EXISTS application_status_history_staff ON public.application_status_history;
CREATE POLICY application_status_history_staff ON public.application_status_history
  FOR SELECT
  TO authenticated
  USING (is_recruiting_staff());

DROP POLICY IF EXISTS application_status_history_hiring_manager ON public.application_status_history;
CREATE POLICY application_status_history_hiring_manager ON public.application_status_history
  FOR SELECT
  TO authenticated
  USING (
    is_hiring_manager()
    AND hiring_manager_sees_application(application_id)
  );

DROP POLICY IF EXISTS application_status_history_staff_write ON public.application_status_history;
CREATE POLICY application_status_history_staff_write ON public.application_status_history
  FOR INSERT
  TO authenticated
  WITH CHECK (is_recruiting_staff());

DROP POLICY IF EXISTS interviews_self ON public.interviews;
CREATE POLICY interviews_self ON public.interviews
  FOR SELECT
  TO authenticated
  USING (
    application_id IN (
      SELECT id FROM applications WHERE candidate_id = current_candidate_id()
    )
  );

DROP POLICY IF EXISTS interviews_staff ON public.interviews;
CREATE POLICY interviews_staff ON public.interviews
  FOR ALL
  TO authenticated
  USING (is_recruiting_staff())
  WITH CHECK (is_recruiting_staff());

DROP POLICY IF EXISTS interviews_hiring_manager ON public.interviews;
CREATE POLICY interviews_hiring_manager ON public.interviews
  FOR SELECT
  TO authenticated
  USING (
    is_hiring_manager()
    AND hiring_manager_sees_application(application_id)
  );

-- Feedback is internal. Candidates have no policy.
DROP POLICY IF EXISTS interview_feedback_staff ON public.interview_feedback;
CREATE POLICY interview_feedback_staff ON public.interview_feedback
  FOR ALL
  TO authenticated
  USING (is_recruiting_staff() OR is_hiring_manager())
  WITH CHECK (is_recruiting_staff() OR is_hiring_manager());

DROP POLICY IF EXISTS interview_panel_members_staff ON public.interview_panel_members;
CREATE POLICY interview_panel_members_staff ON public.interview_panel_members
  FOR ALL
  TO authenticated
  USING (is_recruiting_staff() OR is_hiring_manager())
  WITH CHECK (is_recruiting_staff());

-- Candidate sees only offers that have been sent. Drafts stay internal.
DROP POLICY IF EXISTS offers_self ON public.offers;
CREATE POLICY offers_self ON public.offers
  FOR SELECT
  TO authenticated
  USING (
    status IN ('EXTENDED', 'ACCEPTED', 'DECLINED', 'EXPIRED')
    AND application_id IN (
      SELECT id FROM applications WHERE candidate_id = current_candidate_id()
    )
  );

DROP POLICY IF EXISTS offers_self_respond ON public.offers;
CREATE POLICY offers_self_respond ON public.offers
  FOR UPDATE
  TO authenticated
  USING (
    status = 'EXTENDED'
    AND application_id IN (
      SELECT id FROM applications WHERE candidate_id = current_candidate_id()
    )
  )
  WITH CHECK (
    status IN ('ACCEPTED', 'DECLINED')
    AND application_id IN (
      SELECT id FROM applications WHERE candidate_id = current_candidate_id()
    )
  );

DROP POLICY IF EXISTS offers_staff ON public.offers;
CREATE POLICY offers_staff ON public.offers
  FOR ALL
  TO authenticated
  USING (is_recruiting_staff() OR is_hr_staff())
  WITH CHECK (is_recruiting_staff() OR is_hr_staff());

DROP POLICY IF EXISTS offer_approvals_staff ON public.offer_approvals;
CREATE POLICY offer_approvals_staff ON public.offer_approvals
  FOR ALL
  TO authenticated
  USING (is_recruiting_staff() OR is_hr_staff())
  WITH CHECK (is_recruiting_staff() OR is_hr_staff());

DROP POLICY IF EXISTS recruiting_notes_staff ON public.recruiting_notes;
CREATE POLICY recruiting_notes_staff ON public.recruiting_notes
  FOR ALL
  TO authenticated
  USING (is_recruiting_staff() OR is_hiring_manager())
  WITH CHECK (is_recruiting_staff());

DROP POLICY IF EXISTS recruiting_activities_staff ON public.recruiting_activities;
CREATE POLICY recruiting_activities_staff ON public.recruiting_activities
  FOR SELECT
  TO authenticated
  USING (is_recruiting_staff() OR is_hiring_manager());

DROP POLICY IF EXISTS recruiting_activities_staff_write ON public.recruiting_activities;
CREATE POLICY recruiting_activities_staff_write ON public.recruiting_activities
  FOR INSERT
  TO authenticated
  WITH CHECK (is_recruiting_staff());

DROP POLICY IF EXISTS job_requisitions_staff ON public.job_requisitions;
CREATE POLICY job_requisitions_staff ON public.job_requisitions
  FOR ALL
  TO authenticated
  USING (is_recruiting_staff())
  WITH CHECK (is_recruiting_staff());

DROP POLICY IF EXISTS job_requisitions_hiring_manager ON public.job_requisitions;
CREATE POLICY job_requisitions_hiring_manager ON public.job_requisitions
  FOR SELECT
  TO authenticated
  USING (
    is_hiring_manager()
    AND hiring_manager_user_id = current_profile_id()
  );

DROP POLICY IF EXISTS job_requisition_approvals_staff ON public.job_requisition_approvals;
CREATE POLICY job_requisition_approvals_staff ON public.job_requisition_approvals
  FOR ALL
  TO authenticated
  USING (is_recruiting_staff() OR is_hr_staff())
  WITH CHECK (is_recruiting_staff() OR is_hr_staff());

DROP POLICY IF EXISTS job_skills_staff ON public.job_skills;
CREATE POLICY job_skills_staff ON public.job_skills
  FOR ALL
  TO authenticated
  USING (is_recruiting_staff())
  WITH CHECK (is_recruiting_staff());

DROP POLICY IF EXISTS skills_staff ON public.skills;
CREATE POLICY skills_staff ON public.skills
  FOR SELECT
  TO authenticated
  USING (is_recruiting_staff() OR is_hr_staff());

-- ---------------------------------------------------------------------------
-- Identity / roles — users may read their own role rows, not assign them
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS user_roles_self ON public.user_roles;
CREATE POLICY user_roles_self ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = current_profile_id());

DROP POLICY IF EXISTS user_roles_admin ON public.user_roles;
CREATE POLICY user_roles_admin ON public.user_roles
  FOR ALL
  TO authenticated
  USING (current_user_has_role('SYSTEM_ADMIN') OR is_hr_staff())
  WITH CHECK (current_user_has_role('SYSTEM_ADMIN') OR current_user_has_role('HR_ADMIN'));

DROP POLICY IF EXISTS role_permissions_admin ON public.role_permissions;
CREATE POLICY role_permissions_admin ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (current_user_has_role('SYSTEM_ADMIN') OR is_hr_staff());

DROP POLICY IF EXISTS audit_logs_admin ON public.audit_logs;
CREATE POLICY audit_logs_admin ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (current_user_has_role('SYSTEM_ADMIN') OR current_user_has_role('HR_ADMIN'));

-- ---------------------------------------------------------------------------
-- HR / payroll / employee self-service
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS compensation_self ON public.compensation_records;
CREATE POLICY compensation_self ON public.compensation_records
  FOR SELECT
  TO authenticated
  USING (employee_id = current_employee_id());

DROP POLICY IF EXISTS compensation_payroll ON public.compensation_records;
CREATE POLICY compensation_payroll ON public.compensation_records
  FOR ALL
  TO authenticated
  USING (is_payroll_staff())
  WITH CHECK (is_payroll_staff());

DROP POLICY IF EXISTS employee_status_history_self ON public.employee_status_history;
CREATE POLICY employee_status_history_self ON public.employee_status_history
  FOR SELECT
  TO authenticated
  USING (employee_id = current_employee_id());

DROP POLICY IF EXISTS employee_status_history_hr ON public.employee_status_history;
CREATE POLICY employee_status_history_hr ON public.employee_status_history
  FOR ALL
  TO authenticated
  USING (is_hr_staff())
  WITH CHECK (is_hr_staff());

DROP POLICY IF EXISTS hr_events_self ON public.hr_events;
CREATE POLICY hr_events_self ON public.hr_events
  FOR SELECT
  TO authenticated
  USING (employee_id = current_employee_id());

DROP POLICY IF EXISTS hr_events_hr ON public.hr_events;
CREATE POLICY hr_events_hr ON public.hr_events
  FOR ALL
  TO authenticated
  USING (is_hr_staff())
  WITH CHECK (is_hr_staff());

DROP POLICY IF EXISTS onboarding_self ON public.onboarding_records;
CREATE POLICY onboarding_self ON public.onboarding_records
  FOR SELECT
  TO authenticated
  USING (employee_id = current_employee_id());

DROP POLICY IF EXISTS onboarding_hr ON public.onboarding_records;
CREATE POLICY onboarding_hr ON public.onboarding_records
  FOR ALL
  TO authenticated
  USING (is_hr_staff())
  WITH CHECK (is_hr_staff());

DROP POLICY IF EXISTS onboarding_tasks_self ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_self ON public.onboarding_tasks
  FOR SELECT
  TO authenticated
  USING (employee_id = current_employee_id());

DROP POLICY IF EXISTS onboarding_tasks_self_update ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_self_update ON public.onboarding_tasks
  FOR UPDATE
  TO authenticated
  USING (employee_id = current_employee_id())
  WITH CHECK (employee_id = current_employee_id());

DROP POLICY IF EXISTS onboarding_tasks_hr ON public.onboarding_tasks;
CREATE POLICY onboarding_tasks_hr ON public.onboarding_tasks
  FOR ALL
  TO authenticated
  USING (is_hr_staff())
  WITH CHECK (is_hr_staff());

DROP POLICY IF EXISTS leave_types_read ON public.leave_types;
CREATE POLICY leave_types_read ON public.leave_types
  FOR SELECT
  TO authenticated
  USING (current_employee_id() IS NOT NULL OR is_hr_staff());

DROP POLICY IF EXISTS leave_balances_self ON public.leave_balances;
CREATE POLICY leave_balances_self ON public.leave_balances
  FOR SELECT
  TO authenticated
  USING (employee_id = current_employee_id() OR is_hr_staff() OR manages_employee(employee_id));

DROP POLICY IF EXISTS leave_requests_self ON public.leave_requests;
CREATE POLICY leave_requests_self ON public.leave_requests
  FOR ALL
  TO authenticated
  USING (employee_id = current_employee_id())
  WITH CHECK (employee_id = current_employee_id());

DROP POLICY IF EXISTS leave_requests_manager ON public.leave_requests;
CREATE POLICY leave_requests_manager ON public.leave_requests
  FOR SELECT
  TO authenticated
  USING (manages_employee(employee_id) OR is_hr_staff());

DROP POLICY IF EXISTS leave_requests_hr ON public.leave_requests;
CREATE POLICY leave_requests_hr ON public.leave_requests
  FOR ALL
  TO authenticated
  USING (is_hr_staff())
  WITH CHECK (is_hr_staff());

DROP POLICY IF EXISTS leave_request_days_self ON public.leave_request_days;
CREATE POLICY leave_request_days_self ON public.leave_request_days
  FOR SELECT
  TO authenticated
  USING (
    leave_request_id IN (
      SELECT id FROM leave_requests WHERE employee_id = current_employee_id()
    )
    OR is_hr_staff()
  );

DROP POLICY IF EXISTS timesheets_self ON public.timesheets;
CREATE POLICY timesheets_self ON public.timesheets
  FOR ALL
  TO authenticated
  USING (employee_id = current_employee_id())
  WITH CHECK (employee_id = current_employee_id());

DROP POLICY IF EXISTS timesheets_review ON public.timesheets;
CREATE POLICY timesheets_review ON public.timesheets
  FOR SELECT
  TO authenticated
  USING (manages_employee(employee_id) OR is_hr_staff() OR is_payroll_staff());

DROP POLICY IF EXISTS time_entries_self ON public.time_entries;
CREATE POLICY time_entries_self ON public.time_entries
  FOR ALL
  TO authenticated
  USING (employee_id = current_employee_id())
  WITH CHECK (employee_id = current_employee_id());

DROP POLICY IF EXISTS time_entries_review ON public.time_entries;
CREATE POLICY time_entries_review ON public.time_entries
  FOR SELECT
  TO authenticated
  USING (manages_employee(employee_id) OR is_hr_staff() OR is_payroll_staff());

DROP POLICY IF EXISTS notifications_self ON public.notifications;
CREATE POLICY notifications_self ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    user_id = current_profile_id()
    OR employee_id = current_employee_id()
  );

DROP POLICY IF EXISTS notifications_self_update ON public.notifications;
CREATE POLICY notifications_self_update ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (
    user_id = current_profile_id()
    OR employee_id = current_employee_id()
  )
  WITH CHECK (
    user_id = current_profile_id()
    OR employee_id = current_employee_id()
  );

DROP POLICY IF EXISTS approval_requests_self ON public.approval_requests;
CREATE POLICY approval_requests_self ON public.approval_requests
  FOR SELECT
  TO authenticated
  USING (
    requester_employee_id = current_employee_id()
    OR approver_employee_id = current_employee_id()
    OR is_hr_staff()
  );

DROP POLICY IF EXISTS approval_history_self ON public.approval_history;
CREATE POLICY approval_history_self ON public.approval_history
  FOR SELECT
  TO authenticated
  USING (
    actor_employee_id = current_employee_id()
    OR is_hr_staff()
    OR manages_employee(actor_employee_id)
  );

DROP POLICY IF EXISTS profile_change_self ON public.profile_change_requests;
CREATE POLICY profile_change_self ON public.profile_change_requests
  FOR ALL
  TO authenticated
  USING (employee_id = current_employee_id())
  WITH CHECK (employee_id = current_employee_id());

DROP POLICY IF EXISTS profile_change_hr ON public.profile_change_requests;
CREATE POLICY profile_change_hr ON public.profile_change_requests
  FOR ALL
  TO authenticated
  USING (is_hr_staff())
  WITH CHECK (is_hr_staff());

DROP POLICY IF EXISTS hr_requests_self ON public.hr_requests;
CREATE POLICY hr_requests_self ON public.hr_requests
  FOR ALL
  TO authenticated
  USING (employee_id = current_employee_id())
  WITH CHECK (employee_id = current_employee_id());

DROP POLICY IF EXISTS hr_requests_hr ON public.hr_requests;
CREATE POLICY hr_requests_hr ON public.hr_requests
  FOR ALL
  TO authenticated
  USING (is_hr_staff())
  WITH CHECK (is_hr_staff());

DROP POLICY IF EXISTS hr_request_messages_self ON public.hr_request_messages;
CREATE POLICY hr_request_messages_self ON public.hr_request_messages
  FOR SELECT
  TO authenticated
  USING (
    hr_request_id IN (
      SELECT id FROM hr_requests WHERE employee_id = current_employee_id()
    )
    OR is_hr_staff()
  );

DROP POLICY IF EXISTS document_ack_self ON public.document_acknowledgements;
CREATE POLICY document_ack_self ON public.document_acknowledgements
  FOR SELECT
  TO authenticated
  USING (employee_id = current_employee_id() OR is_hr_staff());

DROP POLICY IF EXISTS document_ack_self_insert ON public.document_acknowledgements;
CREATE POLICY document_ack_self_insert ON public.document_acknowledgements
  FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = current_employee_id());

-- Org reference data is internal. Careers pages read published jobs via service role.
DROP POLICY IF EXISTS org_staff_read ON public.legal_entities;
CREATE POLICY org_staff_read ON public.legal_entities
  FOR SELECT
  TO authenticated
  USING (is_recruiting_staff() OR is_hr_staff() OR is_payroll_staff());

DROP POLICY IF EXISTS org_business_units_staff_read ON public.business_units;
CREATE POLICY org_business_units_staff_read ON public.business_units
  FOR SELECT
  TO authenticated
  USING (is_recruiting_staff() OR is_hr_staff() OR is_payroll_staff());

DROP POLICY IF EXISTS org_departments_staff_read ON public.departments;
CREATE POLICY org_departments_staff_read ON public.departments
  FOR SELECT
  TO authenticated
  USING (is_recruiting_staff() OR is_hr_staff() OR is_payroll_staff());

DROP POLICY IF EXISTS org_positions_staff_read ON public.positions;
CREATE POLICY org_positions_staff_read ON public.positions
  FOR SELECT
  TO authenticated
  USING (is_recruiting_staff() OR is_hr_staff() OR is_payroll_staff());

DROP POLICY IF EXISTS org_locations_staff_read ON public.locations;
CREATE POLICY org_locations_staff_read ON public.locations
  FOR SELECT
  TO authenticated
  USING (is_recruiting_staff() OR is_hr_staff() OR is_payroll_staff());

-- ---------------------------------------------------------------------------
-- CRM — sales roles only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS crm_accounts_sales ON public.crm_accounts;
CREATE POLICY crm_accounts_sales ON public.crm_accounts
  FOR ALL
  TO authenticated
  USING (is_sales_staff())
  WITH CHECK (is_sales_staff());

DROP POLICY IF EXISTS crm_contacts_sales ON public.crm_contacts;
CREATE POLICY crm_contacts_sales ON public.crm_contacts
  FOR ALL
  TO authenticated
  USING (is_sales_staff())
  WITH CHECK (is_sales_staff());

DROP POLICY IF EXISTS crm_opportunities_sales ON public.crm_opportunities;
CREATE POLICY crm_opportunities_sales ON public.crm_opportunities
  FOR ALL
  TO authenticated
  USING (is_sales_staff())
  WITH CHECK (is_sales_staff());

DROP POLICY IF EXISTS crm_activities_sales ON public.crm_activities;
CREATE POLICY crm_activities_sales ON public.crm_activities
  FOR ALL
  TO authenticated
  USING (is_sales_staff())
  WITH CHECK (is_sales_staff());

-- ---------------------------------------------------------------------------
-- Storage: private buckets; owner folder is candidate_id or profile_id
-- ---------------------------------------------------------------------------

UPDATE storage.buckets
   SET public = false
 WHERE id IN (
   'candidate-resumes',
   'candidate-documents',
   'employee-documents',
   'job-assets'
 );

DROP POLICY IF EXISTS candidate_documents_owner_rw ON storage.objects;
CREATE POLICY candidate_documents_owner_rw ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'candidate-documents'
    AND (
      (storage.foldername(name))[1] = current_profile_id()
      OR (storage.foldername(name))[1] = current_candidate_id()
    )
  )
  WITH CHECK (
    bucket_id = 'candidate-documents'
    AND (
      (storage.foldername(name))[1] = current_profile_id()
      OR (storage.foldername(name))[1] = current_candidate_id()
    )
  );

DROP POLICY IF EXISTS candidate_resumes_owner_rw ON storage.objects;
CREATE POLICY candidate_resumes_owner_rw ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'candidate-resumes'
    AND (
      (storage.foldername(name))[1] = current_profile_id()
      OR (storage.foldername(name))[1] = current_candidate_id()
    )
  )
  WITH CHECK (
    bucket_id = 'candidate-resumes'
    AND (
      (storage.foldername(name))[1] = current_profile_id()
      OR (storage.foldername(name))[1] = current_candidate_id()
    )
  );
