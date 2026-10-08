import type { DetailedProfile } from "@/lib/recruiting/detailed-profile";
import type { ParsedResume } from "@/lib/recruiting/resume-parser";
import type { ApplicationStatus } from "@/types/recruiting";

import type { ApplicationDraft, DraftJobSnapshot, DraftPayload } from "@/lib/candidate-portal/drafts";

/**
 * The signed-in candidate. `candidateId` is resolved from the authenticated
 * profile (profiles.auth_user_id → candidate_profiles.profile_id), never from
 * an email address or any client-supplied value.
 */
export type CandidateSession = {
  candidateId: string;
  profileId: string | null;
  email: string;
  displayName: string;
  /** Local development only (no Supabase); never true in production. */
  demo: boolean;
};

export type CandidateProfile = {
  candidateId: string;
  firstName: string;
  lastName: string;
  /** Sign-in identity; changed through account settings, not the profile form. */
  email: string;
  phone: string;
  city: string;
  state: string;
  linkedinUrl: string;
  portfolioUrl: string;
  githubUrl: string;
  professionalSummary: string;
  workAuthorization: string;
};

export type CandidateProfileUpdate = Omit<CandidateProfile, "candidateId" | "email">;

export type ResumeParseState = "PENDING" | "PARSED" | "FAILED" | "UNSUPPORTED";

export type LibraryResume = {
  documentId: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  uploadedAt: string;
  isDefault: boolean;
  status: "ACTIVE" | "ARCHIVED";
  /** Submitted applications that reference this exact file (immutable links). */
  applicationCount: number;
  parse: { state: ResumeParseState; parsedAt: string | null; parserVersion: string | null };
};

export type ResumeProfileView = {
  documentId: string;
  state: ResumeParseState;
  parserVersion: string | null;
  /** What the parser extracted, with evidence quotes. */
  parsed: ParsedResume | null;
  /** The candidate's corrections, kept beside (never over) the parser output. */
  reviewed: DetailedProfile | null;
  reviewedAt: string | null;
};

export type CandidateApplication = {
  applicationId: string;
  applicationNumber: string;
  status: ApplicationStatus;
  appliedAt: string;
  updatedAt: string | null;
  job: { title: string; slug: string | null; company: string | null };
  resume: { documentId: string; fileName: string } | null;
};

export type SavedJob = {
  requisitionId: string;
  savedAt: string;
  job: { slug: string; title: string; location: string; company: string; acceptingApplications: boolean } | null;
};

export type NewResumeFile = { fileName: string; mimeType: string; fileSize: number; bytes: Uint8Array };

export type ResumeDownload =
  | { kind: "redirect"; url: string }
  | { kind: "bytes"; bytes: Uint8Array; mimeType: string; fileName: string };

export type DraftWrite = { payload: DraftPayload; resumeDocumentId: string | null };

/**
 * Candidate-portal persistence. The first argument of every method is the
 * session candidate id, and every implementation scopes every read and write
 * to it — a row owned by another candidate behaves exactly like a missing one.
 */
export type CandidatePortalStore = {
  getProfile(candidateId: string): Promise<CandidateProfile | null>;
  updateProfile(candidateId: string, update: CandidateProfileUpdate): Promise<void>;

  listApplications(candidateId: string): Promise<CandidateApplication[]>;

  listSavedJobs(candidateId: string): Promise<SavedJob[]>;
  isJobSaved(candidateId: string, requisitionId: string): Promise<boolean>;
  saveJob(candidateId: string, requisitionId: string): Promise<void>;
  unsaveJob(candidateId: string, requisitionId: string): Promise<void>;

  listResumes(candidateId: string, options?: { includeArchived?: boolean }): Promise<LibraryResume[]>;
  uploadResume(candidateId: string, file: NewResumeFile, options: { makeDefault: boolean }): Promise<{ documentId: string }>;
  setDefaultResume(candidateId: string, documentId: string): Promise<boolean>;
  /** Archives instead of deleting when submitted applications reference the file. */
  removeResume(candidateId: string, documentId: string): Promise<{ removed: boolean; preservedForApplications: boolean }>;
  resumeDownload(candidateId: string, documentId: string): Promise<ResumeDownload | null>;
  getResumeProfile(candidateId: string, documentId: string): Promise<ResumeProfileView | null>;
  saveResumeReview(candidateId: string, documentId: string, profile: DetailedProfile): Promise<boolean>;

  listDrafts(candidateId: string): Promise<ApplicationDraft[]>;
  getDraft(candidateId: string, draftId: string): Promise<ApplicationDraft | null>;
  findOpenDraft(candidateId: string, requisitionId: string): Promise<ApplicationDraft | null>;
  /** Returns the existing open draft instead of creating a second one for the same job. */
  createDraft(candidateId: string, job: DraftJobSnapshot, write: DraftWrite): Promise<ApplicationDraft>;
  /** "conflict" when the draft changed since `expectedRevision` (another tab/device saved first). */
  updateDraft(
    candidateId: string,
    draftId: string,
    expectedRevision: number,
    write: DraftWrite,
  ): Promise<ApplicationDraft | "conflict" | null>;
  deleteDraft(candidateId: string, draftId: string): Promise<boolean>;
  /** Atomically DRAFT (or an expired SUBMITTING lease) → SUBMITTING. False when another attempt holds it. */
  beginDraftSubmission(candidateId: string, draftId: string, now: Date): Promise<boolean>;
  completeDraftSubmission(candidateId: string, draftId: string, applicationId: string): Promise<void>;
  abortDraftSubmission(candidateId: string, draftId: string): Promise<void>;
  openDraftsUsingResume(candidateId: string, documentId: string): Promise<number>;
};
