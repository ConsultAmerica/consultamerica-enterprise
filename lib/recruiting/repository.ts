import type { EasyApplyResume } from "@/lib/recruiting/easy-apply";
import type { EmploymentType, WorkplaceType } from "@/types/organization";
import type {
  Application,
  ApplicationDocument,
  ApplicationStatus,
  ApplicationStatusHistory,
  CandidateProfile,
  Document,
  Education,
  Experience,
  CandidateSkill,
  CareerArea,
  Interview,
  InterviewFeedback,
  Job,
  JobRequisition,
  Offer,
  OfferStatus,
  RecruitingActivity,
  RequisitionStatus,
} from "@/types/recruiting";

export type RecruitingRepository = {
  listPublishedPostings(): Promise<Job[]>;
  getPostingBySlug(slug: string): Promise<Job | undefined>;
  getPostingBySlugAny(slug: string): Promise<Job | undefined>;
  getRequisitionById(id: string): Promise<JobRequisition | undefined>;
  getCandidateByEmail(email: string): Promise<CandidateProfile | undefined>;
  listApplicationsByRequisition(
    requisitionId: string,
  ): Promise<Application[]>;
  getApplicationById(applicationId: string): Promise<Application | undefined>;
  getOfferByApplicationId(
    applicationId: string,
  ): Promise<Offer | undefined>;
};

/**
 * Aggregate reads for the Workforce App dashboard. Kept separate from the
 * core `RecruitingRepository` interface (which mirrors the public jobs
 * flow) so callers that only need postings/requisitions aren't forced to
 * implement dashboard-specific aggregation.
 */
export type RecruitingDashboardReads = {
  countCandidates(): Promise<number>;
  countOpenRequisitions(): Promise<number>;
  getApplicationPipelineCounts(): Promise<Record<ApplicationStatus, number>>;
  listUpcomingInterviews(limit: number): Promise<Interview[]>;
  listRecentHires(limit: number): Promise<Application[]>;
};

/** One row in the recruiting/candidates list — one row per candidate, keyed to their most recent application. */
export type CandidateListItem = {
  candidateId: string;
  name: string;
  email: string;
  role: string;
  requisitionId?: string;
  applicationNumber: string;
  stage?: ApplicationStatus;
  location: string;
  source?: string;
  workAuthorization?: string;
  appliedAt?: string;
  lastActivityAt: string;
  skills?: string[];
};

/** One row per application — the Applications queue (Workforce -> Recruiting -> Applications). */
export type ApplicationQueueItem = {
  applicationId: string;
  applicationNumber: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  requisitionId?: string;
  departmentName: string;
  locationName: string;
  appliedAt: string;
  status: ApplicationStatus;
  recruiterUserId?: string;
  recruiterName?: string;
  hiringManagerUserId?: string;
  hiringManagerName?: string;
  lastActivityAt: string;
  skills?: string[];
};

export type RecruitingApplicationQueueReads = {
  listApplicationsQueue(): Promise<ApplicationQueueItem[]>;
};

/** Latest Candidate Match (Job Analyzer) result for one candidate/job pair. */
export type CandidateMatchScoreSummary = {
  candidateId: string;
  requisitionId: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  createdAt: string;
};

export type RecruitingMatchScoreReads = {
  /**
   * Returns the most recent jd_analysis row for each requested
   * candidate/requisition pair (omitted where no analysis has been run).
   * Callers pass the same requisitionId for every pair when they want all
   * scores for one job (job pipeline, job detail candidates tab).
   */
  listLatestMatchScoresForPairs(
    pairs: { candidateId: string; requisitionId: string }[],
  ): Promise<CandidateMatchScoreSummary[]>;
};

export type CandidateApplicationSummary = {
  applicationId: string;
  applicationNumber: string;
  requisitionId: string;
  requisitionTitle: string;
  requisitionNumber: string;
  postingLocation: string;
  employmentType?: EmploymentType;
  status: ApplicationStatus;
  appliedAt: string;
  updatedAt: string;
};

export type CandidateInterviewSummary = Interview & {
  applicationNumber: string;
  requisitionTitle: string;
};

/**
 * Full aggregate read for one candidate — candidate record plus everything
 * that hangs off it. Named `...Detail` to avoid colliding with the
 * `CandidateProfile` entity type (the `candidate_profiles` row itself).
 */
export type CandidateProfileDetail = {
  candidate: CandidateProfile;
  applications: CandidateApplicationSummary[];
  experience: Experience[];
  education: Education[];
  skills: CandidateSkill[];
  documents: Document[];
  /** application_documents join rows for this candidate's applications */
  applicationDocumentLinks?: Array<{
    id: string;
    applicationId: string;
    documentId: string;
    purpose?: ApplicationDocument["purpose"];
    documentRole?: ApplicationDocument["documentRole"];
    createdAt: string;
    attachedAt?: string;
    requisitionTitle?: string;
    appliedAt?: string;
  }>;
  statusHistory?: ApplicationStatusHistory[];
  offers?: Offer[];
  interviews: CandidateInterviewSummary[];
  feedback: InterviewFeedback[];
  activities: RecruitingActivity[];
};

/** Candidate list/profile reads backing the ATS (Recruiting > Candidates). */
export type RecruitingCandidateReads = {
  listCandidateSummaries(): Promise<CandidateListItem[]>;
  getCandidateProfile(candidateId: string): Promise<CandidateProfileDetail | undefined>;
};

export type UpdateCandidateContactInfoInput = {
  firstName?: string;
  lastName?: string;
  preferredName?: string;
  phone?: string;
  city?: string;
  state?: string;
  professionalSummary?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  workAuthorization?: string;
  willingToRelocate?: boolean;
};

/** Write backing the Candidate Portal's own-profile contact info edit. */
export type RecruitingCandidateSelfWrites = {
  updateCandidateContactInfo(
    candidateId: string,
    input: UpdateCandidateContactInfoInput,
  ): Promise<CandidateProfile>;
};

/** One row in the recruiting/jobs list. */
export type JobListItem = {
  requisitionId: string;
  requisitionNumber: string;
  title: string;
  departmentName: string;
  locationName: string;
  workplaceType: WorkplaceType;
  employmentType: EmploymentType;
  status: RequisitionStatus;
  candidateCount: number;
  updatedAt: string;
};

export type JobDetail = {
  requisition: JobRequisition;
  departmentName: string;
  locationName: string;
  postingSlug?: string;
  candidateCount: number;
  pipelineCounts: Record<ApplicationStatus, number>;
};

export type CreateJobRequisitionInput = {
  title: string;
  departmentId: string;
  departmentName: string;
  positionId: string;
  locationId: string;
  locationName: string;
  hiringManagerUserId?: string;
  recruiterUserId?: string;
  employmentType: EmploymentType;
  workplaceType: WorkplaceType;
  careerArea: CareerArea;
  openings: number;
  salaryMin?: number;
  salaryMax?: number;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  preferredQualifications: string[];
  /**
   * Stored behind migration 049 (db/schema/049_job_benefits.sql). Optional
   * because non-form callers (email intake drafts) build this input without
   * it, and because implementations must stay writable before 049 is applied.
   */
  benefits?: string[];
  experienceLevel?: string;
  /** ISO timestamp; after it passes the posting stops being publicly open. */
  applicationDeadline?: string;
  publishNow: boolean;
  publishAt?: string;
  expiresAt?: string;
};

/**
 * Full replace of a requisition's recruiter-editable fields. Deliberately
 * excludes status: publication moves go through setJobStatus so there is one
 * place that keeps the requisition and its public posting in step.
 */
export type UpdateJobRequisitionInput = {
  title: string;
  departmentId: string;
  departmentName: string;
  positionId: string;
  locationId: string;
  locationName: string;
  employmentType: EmploymentType;
  workplaceType: WorkplaceType;
  careerArea: CareerArea;
  openings: number;
  salaryMin?: number;
  salaryMax?: number;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  preferredQualifications: string[];
  benefits?: string[];
  experienceLevel?: string;
  applicationDeadline?: string;
};

/** One option in a create/edit form dropdown backed by an FK lookup table. */
export type LookupOption = { id: string; name: string };

/**
 * Publication states a recruiter can drive from the workspace. These are
 * posting (`jobs`) statuses; implementations map each one onto the narrower
 * RequisitionStatus set as well. Only PUBLISHED is public — see setJobStatus.
 */
export type JobPublicationStatus = "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED" | "DRAFT";

/** Reads backing the ATS Jobs / Requisitions workspace. */
export type RecruitingJobReads = {
  listJobSummaries(): Promise<JobListItem[]>;
  getJobDetail(requisitionId: string): Promise<JobDetail | undefined>;
  /**
   * FK lookups for the job form's dropdowns. job_requisitions has NOT NULL
   * references to all three, so a create form cannot be filled without them.
   * Implementations return [] rather than throwing when a lookup fails: an
   * empty dropdown the form can report beats a 500 on the whole page.
   */
  listDepartments(): Promise<LookupOption[]>;
  listLocations(): Promise<LookupOption[]>;
  listPositions(): Promise<LookupOption[]>;
  /**
   * Read-back for the edit form. Separate from JobDetail because `benefits`
   * is a migration-049 storage column, not part of the JobRequisition/Job
   * domain model — and because it must answer [] on a database where 049 has
   * not been applied instead of failing the page.
   */
  getJobBenefits(requisitionId: string): Promise<string[]>;
};

/** Recruiter edits to a job description (requisition + its posting). Never changes status. */
export type JobDescriptionInput = {
  summary: string;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  preferredQualifications: string[];
  experienceLevel?: string;
  /** ISO date; empty clears it. */
  applicationDeadline?: string;
};

/** Writes backing requisition creation/publishing from the ATS. */
export type RecruitingJobWrites = {
  updateJobDescription(requisitionId: string, input: JobDescriptionInput): Promise<{ postingUpdated: boolean } | undefined>;
  /** The posting's editable fields, for the recruiter editor. */
  getPostingForRequisition(requisitionId: string): Promise<Job | undefined>;
  createJobRequisition(
    input: CreateJobRequisitionInput,
  ): Promise<{ requisitionId: string; postingSlug?: string }>;
  publishJobRequisition(
    requisitionId: string,
  ): Promise<{ postingSlug: string } | undefined>;
  /** Full replace of the editable fields, mirrored onto the posting when one exists. */
  updateJobRequisition(
    requisitionId: string,
    input: UpdateJobRequisitionInput,
  ): Promise<{ ok: boolean }>;
  /**
   * The single publication switch. PUBLISHED creates the public posting when
   * the requisition has none; UNPUBLISHED/ARCHIVED/DRAFT all leave the job out
   * of the public listings (lib/jobs/eligibility LIVE_JOB_STATUSES admits only
   * PUBLISHED and OPEN). Returns undefined when the requisition is unknown.
   */
  setJobStatus(
    requisitionId: string,
    status: JobPublicationStatus,
  ): Promise<{ postingSlug?: string } | undefined>;
  /**
   * Hard delete, refused while applications reference the requisition —
   * removing it would orphan candidate records. Archive is the right move
   * for a job that has already been applied to.
   */
  deleteJobRequisition(
    requisitionId: string,
  ): Promise<{ ok: boolean; blockedByApplications?: number }>;
};

export type SubmitApplicationInput = {
  requisitionId: string;
  postingId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  workAuthorization?: string;
  willingToRelocate?: boolean;
  coverLetter?: string;
  additionalInformation?: string;
  source?: string;
  /** Required by the Supabase repository (unless libraryResumeDocumentId is set): Easy Apply persists it before success. */
  resume?: EasyApplyResume;
  /**
   * Server-only. The signed-in candidate's id, resolved from the session —
   * never from client input. Skips the email lookup so the application is
   * filed on the authenticated candidate's own record.
   */
  sessionCandidateId?: string;
  /** Server-only, with sessionCandidateId: submit a résumé already in that candidate's library. */
  libraryResumeDocumentId?: string;
  /** Server-only: false skips the portal invitation email (rate-limited anonymous submissions). */
  allowPortalInvite?: boolean;
};

export type SubmitApplicationResult = {
  candidateId: string;
  applicationId: string;
  applicationNumber: string;
  /** Present when a resume was persisted and linked (Supabase Easy Apply). */
  resumeDocumentId?: string;
  outcome?: "created" | "existing" | "recovered";
};

/** Writes backing the public "Apply" flow (candidate + application creation). */
export type RecruitingApplicationWrites = {
  submitApplication(
    input: SubmitApplicationInput,
  ): Promise<SubmitApplicationResult>;
};

/** Writes backing the ATS pipeline board ("Move to Stage"). */
export type RecruitingPipelineWrites = {
  updateApplicationStage(
    applicationId: string,
    status: ApplicationStatus,
  ): Promise<void>;
};

export type CreateOfferInput = {
  applicationId: string;
  baseSalary?: number;
  hourlyRate?: number;
  currency?: string;
  employmentType: EmploymentType;
  workplaceType: WorkplaceType;
  startDate: string;
  expirationDate?: string;
  termsSummary?: string;
};

/** Writes backing offer extension/acceptance from the ATS pipeline. */
export type RecruitingOfferWrites = {
  createOffer(input: CreateOfferInput): Promise<Offer>;
  updateOfferStatus(
    offerId: string,
    status: OfferStatus,
  ): Promise<Offer | undefined>;
};

/**
 * Hire conversion contract. Implementations must create/reuse an
 * employee_profiles row linked back to candidate_profiles via candidateId —
 * never a disconnected employee record.
 */
export type HireConversionInput = {
  applicationId: string;
  offerId: string;
  startDate: string;
  departmentId: string;
  positionId: string;
  locationId: string;
  managerEmployeeId?: string;
};

export type HireConversionResult = {
  employeeId: string;
  employeeNumber: string;
  assignmentId: string;
  onboardingId: string;
};

export type HireConversionService = {
  convertAcceptedOffer(
    input: HireConversionInput,
  ): Promise<HireConversionResult>;
};
