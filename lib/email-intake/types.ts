/**
 * Email job intake domain types. Provider DTOs (lib/email-intake/zoho/*) are
 * mapped into these before anything else sees them.
 */

export const INTAKE_CLASSIFICATIONS = [
  "JOB_REQUIREMENT",
  "JOB_UPDATE",
  "CANDIDATE_SUBMISSION",
  "GENERAL_RECRUITING",
  "NON_RECRUITING",
  "UNKNOWN",
] as const;
export type IntakeClassification = (typeof INTAKE_CLASSIFICATIONS)[number];

export const INTAKE_STATUSES = [
  "RECEIVED",
  "PROCESSING",
  "REVIEW_REQUIRED",
  "DRAFTED",
  "LINKED",
  "IGNORED",
  "NOT_A_JOB",
  "FAILED",
] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export type FieldStatus = "EXPLICIT" | "INFERRED" | "MISSING";
export type FieldSource = "subject" | "body" | "attachment" | "thread";

export type ExtractedField = {
  /** Scalar fields use string; list fields use string[]. null when MISSING. */
  value: string | string[] | null;
  status: FieldStatus;
  /** Verbatim quote from the email/attachment supporting the value. */
  evidence: string | null;
  source: FieldSource | null;
  confidence: number | null;
};

export const SCALAR_FIELDS = [
  "title",
  "location",
  "workArrangement",
  "employmentType",
  "contractType",
  "description",
  "minimumExperience",
  "experienceLevel",
  "education",
  "compensation",
  "duration",
  "startDate",
  "clientReference",
  "recruiter",
  "hiringManager",
  "workAuthorization",
  "applicationDeadline",
  "requestedPublishDate",
] as const;
export const LIST_FIELDS = ["responsibilities", "requiredSkills", "preferredSkills", "certifications"] as const;
export type ScalarFieldKey = (typeof SCALAR_FIELDS)[number];
export type ListFieldKey = (typeof LIST_FIELDS)[number];
export type ExtractionFieldKey = ScalarFieldKey | ListFieldKey;
export const EXTRACTION_FIELDS: readonly ExtractionFieldKey[] = [...SCALAR_FIELDS, ...LIST_FIELDS];

/**
 * Fields that must be stated in the email. An AI "inference" for these is
 * treated as missing — e.g. never guess pay, arrangement or years required.
 */
export const EXPLICIT_ONLY_FIELDS: ReadonlySet<ExtractionFieldKey> = new Set<ExtractionFieldKey>([
  "workArrangement",
  "employmentType",
  "contractType",
  "minimumExperience",
  "compensation",
  "duration",
  "startDate",
  "clientReference",
  "workAuthorization",
  "applicationDeadline",
  "requestedPublishDate",
]);

export const FIELD_LABELS: Record<ExtractionFieldKey, string> = {
  title: "Job title",
  location: "Location",
  workArrangement: "Work arrangement",
  employmentType: "Employment type",
  contractType: "Contract type",
  description: "Description",
  minimumExperience: "Minimum experience",
  experienceLevel: "Experience level",
  education: "Education",
  compensation: "Compensation / rate",
  duration: "Duration",
  startDate: "Start date",
  clientReference: "Client / reference no.",
  recruiter: "Recruiter",
  hiringManager: "Hiring manager",
  workAuthorization: "Work authorization",
  applicationDeadline: "Application deadline",
  requestedPublishDate: "Requested publish date",
  responsibilities: "Responsibilities",
  requiredSkills: "Required skills",
  preferredSkills: "Preferred skills",
  certifications: "Certifications",
};

export type JobExtraction = {
  fields: Record<ExtractionFieldKey, ExtractedField>;
  /** Problems found while validating the AI output (e.g. unsupported values removed). */
  warnings: string[];
};

export type DuplicateSignal = {
  kind: "SAME_THREAD" | "SAME_REFERENCE" | "SIMILAR_REQUISITION" | "SIMILAR_JOB" | "SIMILAR_INTAKE";
  /** Id of the matching intake message, requisition or job. */
  reference: string;
  detail: string;
};

export type IntakeAttachment = {
  providerAttachmentId: string;
  name: string;
  size: number;
  mimeType: string | null;
  status: "EXTRACTED" | "SKIPPED" | "REJECTED" | "FAILED";
  reason?: string;
  textChars: number;
};

export type ClassificationResult = {
  classification: IntakeClassification;
  confidence: number;
  source: "RULES" | "AI" | "RECRUITER";
  reasons: string[];
};

/** Draft values a recruiter edits before approval (separate from the AI extraction). */
export type ReviewDraft = Partial<Record<ExtractionFieldKey, string>>;

export type IntakeMessage = {
  id: string;
  sourceId: string;
  provider: "zoho" | "mock";
  providerAccountId: string;
  providerFolderId: string;
  providerMessageId: string;
  providerThreadId: string | null;
  fromAddress: string | null;
  fromName: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string | null;
  receivedAt: string;
  normalizedText: string | null;
  attachments: IntakeAttachment[];
  hasAttachments: boolean;
  classification: IntakeClassification | null;
  classificationConfidence: number | null;
  classificationSource: ClassificationResult["source"] | null;
  classificationReasons: string[];
  extraction: JobExtraction | null;
  extractionModel: string | null;
  extractedAt: string | null;
  duplicateSignals: DuplicateSignal[];
  reviewDraft: ReviewDraft | null;
  processingStatus: IntakeStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  linkedRequisitionId: string | null;
  linkedJobId: string | null;
  reviewedByProfileId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IntakeSource = {
  id: string;
  provider: "zoho" | "mock";
  providerAccountId: string;
  providerFolderId: string;
  mailboxAddress: string | null;
  folderName: string | null;
  initialSyncAfter: string;
  syncCursorReceivedAt: string | null;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSyncStatus: "OK" | "PARTIAL" | "FAILED" | null;
  lastError: string | null;
  consecutiveFailures: number;
};

export type IntakeEventType =
  | "INGESTED"
  | "CLASSIFIED"
  | "EXTRACTED"
  | "DUPLICATE_SUSPECTED"
  | "PROCESSING_FAILED"
  | "FIELDS_EDITED"
  | "DRAFT_CREATED"
  | "LINKED_TO_REQUISITION"
  | "IGNORED"
  | "MARKED_NOT_A_JOB"
  | "SYNC_COMPLETED"
  | "SYNC_FAILED";

export type IntakeEvent = {
  id: string;
  intakeMessageId: string | null;
  sourceId: string | null;
  eventType: IntakeEventType;
  actorType: "SYSTEM" | "RECRUITER";
  actorProfileId: string | null;
  requisitionId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};
