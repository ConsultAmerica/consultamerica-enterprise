/**
 * Row types for the Neon recruitment schema.
 *
 * These mirror db/neon/001_init.sql by hand, column for column. Nothing here is
 * derived from a query result or generated: the SQL file is the contract, and a
 * hand-written mirror fails loudly at compile time when the two drift, which is
 * the whole point.
 *
 * Two driver details decide the TypeScript types, and they are not obvious:
 *
 *   * TIMESTAMPTZ arrives as a JavaScript `Date`. The driver installs the same
 *     type parsers as node-postgres, for both the HTTP and the pooled
 *     transport, so it is never a string here.
 *   * NUMERIC arrives as a `string`, not a `number`. That is deliberate in
 *     node-postgres: NUMERIC can hold values a double cannot represent, so
 *     parsing it to a float would quietly lose precision. Only
 *     `interviews.score` is affected.
 */

// ------------------------------------------------------------------ CHECK enums
// Each union below is the exact value list of a CHECK constraint in the schema.
// They are CHECKs rather than Postgres enum types because widening a CHECK is a
// cheap ALTER, so expect these lists to grow.

/** jobs.status */
export type JobStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";

/** applications.status. HIRED, REJECTED and WITHDRAWN are terminal. */
export type ApplicationStatus =
  | "NEW"
  | "SCREENING"
  | "INTERVIEW"
  | "SHORTLISTED"
  | "OFFER"
  | "HIRED"
  | "REJECTED"
  | "WITHDRAWN";

/**
 * applications.method — how the candidate applied.
 *
 * Not nullable anywhere: db/neon/003_consulthire.sql defaults it to
 * EASY_APPLY, on the grounds that "we do not know how this person applied" is
 * not a state worth being able to represent.
 */
export type ApplicationMethod = "EASY_APPLY" | "AI_INTERVIEW";

/**
 * jobs.consulthire_status — the generation lifecycle of the job's role-level
 * AI interview, deliberately separate from the job's own status.
 *
 * NONE    no interview has been asked for. Easy Apply only, which is a
 *         perfectly good state and the one every job starts in.
 * PENDING generation is in flight. Set before the call so a reload during the
 *         LLM round trip shows progress rather than NONE.
 * READY   there is a link, and the public page may offer the AI route.
 * FAILED  generation was attempted and did not work; consulthire_error says
 *         why, in words a recruiter can act on.
 */
export type ConsultHireStatus = "NONE" | "PENDING" | "READY" | "FAILED";

/** jobs.workplace_type */
export type WorkplaceType = "REMOTE" | "HYBRID" | "ONSITE";

/** jobs.employment_type */
export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "TEMPORARY"
  | "INTERNSHIP";

/** admin_users.role */
export type AdminRole = "OWNER" | "ADMIN" | "RECRUITER";

/** application_activities.kind */
export type ActivityKind =
  | "APPLIED"
  | "STATUS_CHANGED"
  | "NOTE_ADDED"
  | "RECRUITER_ASSIGNED"
  | "EMAIL_SENT"
  | "INTERVIEW_SCHEDULED"
  | "INTERVIEW_COMPLETED"
  | "CRM_SYNCED";

/** interviews.kind */
export type InterviewKind = "AI_SCREEN" | "PHONE" | "TECHNICAL" | "PANEL" | "FINAL";

/**
 * interviews.status
 *
 * INVITED is the AI route's first state and was added by
 * db/neon/004_consulthire_invited.sql. The row is written before the candidate
 * reaches ConsultHire (the completion webhook needs somewhere to land), so
 * "handed a link, never started" is a real and often permanent state. It is not
 * SCHEDULED, which would claim a time was agreed with somebody.
 */
export type InterviewStatus =
  | "INVITED"
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

/** zoho_sync_queue.status */
export type SyncStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SUCCEEDED"
  | "FAILED"
  | "ABANDONED";

/** zoho_sync_queue.entity_type */
export type SyncEntityType = "CANDIDATE" | "APPLICATION";

/** zoho_sync_queue.operation */
export type SyncOperation = "UPSERT" | "UPDATE_STATUS";

// Runtime value lists, for validating untrusted input before it reaches a
// statement. A CHECK violation is a 500; a rejected value is a 400.
export const JOB_STATUSES: readonly JobStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "UNPUBLISHED",
  "ARCHIVED",
];

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "NEW",
  "SCREENING",
  "INTERVIEW",
  "SHORTLISTED",
  "OFFER",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
];

export const WORKPLACE_TYPES: readonly WorkplaceType[] = ["REMOTE", "HYBRID", "ONSITE"];

export const EMPLOYMENT_TYPES: readonly EmploymentType[] = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "TEMPORARY",
  "INTERNSHIP",
];

export const ADMIN_ROLES: readonly AdminRole[] = ["OWNER", "ADMIN", "RECRUITER"];

export const INTERVIEW_KINDS: readonly InterviewKind[] = [
  "AI_SCREEN",
  "PHONE",
  "TECHNICAL",
  "PANEL",
  "FINAL",
];

export const INTERVIEW_STATUSES: readonly InterviewStatus[] = [
  "INVITED",
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

export const APPLICATION_METHODS: readonly ApplicationMethod[] = [
  "EASY_APPLY",
  "AI_INTERVIEW",
];

export const CONSULTHIRE_STATUSES: readonly ConsultHireStatus[] = [
  "NONE",
  "PENDING",
  "READY",
  "FAILED",
];

/** Terminal application states: no further pipeline movement is expected. */
export const TERMINAL_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
];

export function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === "string" && (JOB_STATUSES as readonly string[]).includes(value);
}

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return (
    typeof value === "string" &&
    (APPLICATION_STATUSES as readonly string[]).includes(value)
  );
}

export function isApplicationMethod(value: unknown): value is ApplicationMethod {
  return (
    typeof value === "string" &&
    (APPLICATION_METHODS as readonly string[]).includes(value)
  );
}

// ------------------------------------------------------------------- admin_users

export interface AdminUserRow {
  id: string;
  email: string;
  /** bcrypt/argon2 output. Never send this past the data layer. */
  password_hash: string;
  full_name: string;
  role: AdminRole;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AdminSessionRow {
  id: string;
  admin_user_id: string;
  token_hash: string;
  expires_at: Date;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
}

export interface AdminPasswordResetRow {
  id: string;
  admin_user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

// -------------------------------------------------------------------------- jobs

export interface JobRow {
  id: string;
  slug: string;
  reference: string;
  title: string;
  department: string;
  location: string;
  workplace_type: WorkplaceType;
  employment_type: EmploymentType;
  experience_level: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  application_deadline: Date | null;
  status: JobStatus;
  published_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;

  // --- ConsultHire role interview (db/neon/003_consulthire.sql) -------------
  //
  // The link belongs to the opening, not to any candidate: everyone who
  // applies is interviewed against the same generated plan and gets their own
  // session underneath it. All four identity columns are nullable because a
  // job with no interview is the normal, default state.
  consulthire_role_id: string | null;
  consulthire_slug: string | null;
  /** Full launch URL as ConsultHire reported it. Stored rather than rebuilt
   *  from the slug so a base-URL change cannot silently rewrite old links. */
  consulthire_url: string | null;
  consulthire_status: ConsultHireStatus;
  /** Why the last generation failed, in words a recruiter can act on. */
  consulthire_error: string | null;
  consulthire_synced_at: Date | null;
}

// -------------------------------------------------------------------- candidates

export interface CandidateRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  zoho_contact_id: string | null;
  created_at: Date;
  updated_at: Date;
}

// ------------------------------------------------------------------ applications

export interface ApplicationRow {
  id: string;
  reference: string;
  job_id: string;
  candidate_id: string;
  status: ApplicationStatus;
  resume_url: string | null;
  resume_filename: string | null;
  resume_size_bytes: number | null;
  relevant_experience: string | null;
  additional_info: string | null;
  source: string;
  assigned_recruiter_id: string | null;
  zoho_synced_at: Date | null;
  applied_at: Date;
  updated_at: Date;
  /**
   * How they applied. `source` answers "which site sent them", which is a
   * different question: both methods have source 'careers'.
   */
  method: ApplicationMethod;
}

// ----------------------------------------------------------------------- CRM bits

export interface ApplicationActivityRow {
  id: string;
  application_id: string;
  actor_id: string | null;
  kind: ActivityKind;
  /**
   * Plain TEXT in the schema, not constrained to the status CHECK, because the
   * audit trail must survive a status value being renamed or retired.
   */
  from_status: string | null;
  to_status: string | null;
  detail: string | null;
  created_at: Date;
}

// ---------------------------------------------------------------------- interviews

export interface InterviewRow {
  id: string;
  application_id: string;
  kind: InterviewKind;
  status: InterviewStatus;
  scheduled_at: Date | null;
  completed_at: Date | null;
  consulthire_interview_id: string | null;
  /** NUMERIC(5,2). A string, for the precision reason at the top of this file. */
  score: string | null;
  summary: string | null;
  created_at: Date;
  updated_at: Date;

  // --- completion detail (db/neon/003_consulthire.sql) ---------------------
  //
  // `report` is jsonb, so the driver hands back a parsed object and not a
  // string. Typed as unknown rather than as the report shape: it is written by
  // another product and an interface here would be a promise this codebase
  // cannot keep. lib/consulthire/report.ts narrows it defensively at the one
  // place it is rendered.
  report: unknown;
  verdict: string | null;
  transcript_url: string | null;
  /** Set once, by the second-round action, so the invitation cannot double-send. */
  second_round_sent_at: Date | null;
  /** When the candidate was sent to ConsultHire, as opposed to when the row
   *  was created. Equal in practice today; different the moment an invitation
   *  is emailed rather than clicked through. */
  launched_at: Date | null;
}

// -------------------------------------------------------------------- Zoho sync

export interface ZohoSyncQueueRow {
  id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: SyncOperation;
  status: SyncStatus;
  attempts: number;
  last_error: string | null;
  next_attempt_at: Date;
  zoho_record_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ZohoOAuthTokenRow {
  /** Primary key. A name, so sandbox and production tokens can coexist. */
  name: string;
  refresh_token: string;
  access_token: string | null;
  access_expires_at: Date | null;
  api_domain: string | null;
  created_at: Date;
  updated_at: Date;
}
