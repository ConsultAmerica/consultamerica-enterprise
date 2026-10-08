/**
 * In-memory candidate-portal store: unit tests and local demo mode only
 * (non-production, Supabase unset). Same ownership contract as the Supabase
 * store — every lookup is keyed by the session candidate id.
 */

import { isLeaseExpired, type ApplicationDraft, type DraftJobSnapshot } from "@/lib/candidate-portal/drafts";
import type {
  CandidateApplication,
  CandidatePortalStore,
  CandidateProfile,
  DraftWrite,
  LibraryResume,
  ResumeParseState,
  SavedJob,
} from "@/lib/candidate-portal/types";
import type { DetailedProfile } from "@/lib/recruiting/detailed-profile";
import type { ResumeProfileStore } from "@/lib/recruiting/resume-profiles";

type StoredResume = {
  documentId: string;
  candidateId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  bytes: Uint8Array;
  uploadedAt: string;
  isDefault: boolean;
  status: "ACTIVE" | "ARCHIVED" | "DELETED";
  applicationIds: Set<string>;
};

export type MemoryCandidatePortalDeps = {
  /** Job lookup for saved jobs (demo: the in-memory job list). */
  lookupJob?: (requisitionId: string) => Promise<SavedJob["job"]>;
  /** Parser output store shared with lib/recruiting/resume-profiles-server. */
  resumeProfiles?: ResumeProfileStore;
  newId?: (prefix: string) => string;
  now?: () => Date;
};

export type MemoryCandidatePortalStore = CandidatePortalStore & {
  seedProfile(profile: CandidateProfile): void;
  /** Demo/test hook standing in for the ATS: records an application filed for the candidate. */
  recordApplication(candidateId: string, application: CandidateApplication): void;
};

export function createMemoryCandidatePortalStore(deps: MemoryCandidatePortalDeps = {}): MemoryCandidatePortalStore {
  const newId = deps.newId ?? ((prefix: string) => `${prefix}-${crypto.randomUUID()}`);
  const now = deps.now ?? (() => new Date());
  const profiles = new Map<string, CandidateProfile>();
  const applications = new Map<string, CandidateApplication[]>();
  const saved = new Map<string, Map<string, string>>(); // candidate -> requisition -> savedAt
  const resumes = new Map<string, StoredResume>();
  const reviews = new Map<string, { profile: DetailedProfile; at: string }>();
  const drafts = new Map<string, ApplicationDraft>();

  const ownResume = (candidateId: string, documentId: string) => {
    const r = resumes.get(documentId);
    return r && r.candidateId === candidateId && r.status !== "DELETED" ? r : null;
  };
  const ownDraft = (candidateId: string, draftId: string) => {
    const d = drafts.get(draftId);
    return d && d.candidateId === candidateId ? d : null;
  };
  const clone = (d: ApplicationDraft): ApplicationDraft => structuredClone(d);
  const openDraftFor = (candidateId: string, requisitionId: string) =>
    [...drafts.values()].find((x) => x.candidateId === candidateId && x.job.requisitionId === requisitionId && x.status !== "SUBMITTED");

  async function parseState(documentId: string): Promise<{ state: ResumeParseState; parsedAt: string | null; parserVersion: string | null }> {
    const p = await deps.resumeProfiles?.getByDocument(documentId);
    return p ? { state: p.status, parsedAt: p.parsedAt, parserVersion: p.parserVersion } : { state: "PENDING", parsedAt: null, parserVersion: null };
  }

  return {
    seedProfile(profile) {
      profiles.set(profile.candidateId, { ...profile });
    },
    recordApplication(candidateId, application) {
      const list = applications.get(candidateId) ?? [];
      if (!list.some((a) => a.applicationId === application.applicationId)) list.unshift(application);
      applications.set(candidateId, list);
      if (application.resume) resumes.get(application.resume.documentId)?.applicationIds.add(application.applicationId);
    },

    async getProfile(candidateId) {
      const p = profiles.get(candidateId);
      return p ? { ...p } : null;
    },
    async updateProfile(candidateId, update) {
      const p = profiles.get(candidateId);
      if (p) profiles.set(candidateId, { ...p, ...update, candidateId, email: p.email });
    },

    async listApplications(candidateId) {
      return (applications.get(candidateId) ?? []).map((a) => ({ ...a }));
    },

    async listSavedJobs(candidateId) {
      const entries = [...(saved.get(candidateId) ?? new Map()).entries()].sort((a, b) => b[1].localeCompare(a[1]));
      return Promise.all(
        entries.map(async ([requisitionId, savedAt]) => ({
          requisitionId,
          savedAt,
          job: (await deps.lookupJob?.(requisitionId)) ?? null,
        })),
      );
    },
    async isJobSaved(candidateId, requisitionId) {
      return saved.get(candidateId)?.has(requisitionId) ?? false;
    },
    async saveJob(candidateId, requisitionId) {
      const m = saved.get(candidateId) ?? new Map<string, string>();
      if (!m.has(requisitionId)) m.set(requisitionId, now().toISOString());
      saved.set(candidateId, m);
    },
    async unsaveJob(candidateId, requisitionId) {
      saved.get(candidateId)?.delete(requisitionId);
    },

    async listResumes(candidateId, options) {
      const rows = [...resumes.values()]
        .filter((r) => r.candidateId === candidateId && (r.status === "ACTIVE" || (options?.includeArchived && r.status === "ARCHIVED")))
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      return Promise.all(
        rows.map(
          async (r): Promise<LibraryResume> => ({
            documentId: r.documentId,
            fileName: r.fileName,
            mimeType: r.mimeType,
            fileSize: r.fileSize,
            uploadedAt: r.uploadedAt,
            isDefault: r.isDefault,
            status: r.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
            applicationCount: r.applicationIds.size,
            parse: await parseState(r.documentId),
          }),
        ),
      );
    },
    async uploadResume(candidateId, file, options) {
      const documentId = newId("doc");
      const hasDefault = [...resumes.values()].some((r) => r.candidateId === candidateId && r.status === "ACTIVE" && r.isDefault);
      const makeDefault = options.makeDefault || !hasDefault;
      if (makeDefault) for (const r of resumes.values()) if (r.candidateId === candidateId) r.isDefault = false;
      resumes.set(documentId, {
        documentId,
        candidateId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        bytes: file.bytes,
        uploadedAt: now().toISOString(),
        isDefault: makeDefault,
        status: "ACTIVE",
        applicationIds: new Set(),
      });
      return { documentId };
    },
    async setDefaultResume(candidateId, documentId) {
      const target = ownResume(candidateId, documentId);
      if (!target || target.status !== "ACTIVE") return false;
      for (const r of resumes.values()) if (r.candidateId === candidateId) r.isDefault = r.documentId === documentId;
      return true;
    },
    async removeResume(candidateId, documentId) {
      const r = ownResume(candidateId, documentId);
      if (!r) return { removed: false, preservedForApplications: false };
      r.isDefault = false;
      if (r.applicationIds.size > 0) {
        r.status = "ARCHIVED";
        return { removed: true, preservedForApplications: true };
      }
      r.status = "DELETED";
      r.bytes = new Uint8Array();
      return { removed: true, preservedForApplications: false };
    },
    async resumeDownload(candidateId, documentId) {
      const r = ownResume(candidateId, documentId);
      return r ? { kind: "bytes", bytes: r.bytes, mimeType: r.mimeType, fileName: r.fileName } : null;
    },
    async getResumeProfile(candidateId, documentId) {
      if (!ownResume(candidateId, documentId)) return null;
      const p = await deps.resumeProfiles?.getByDocument(documentId);
      const review = reviews.get(documentId);
      return {
        documentId,
        state: p?.status ?? "PENDING",
        parserVersion: p?.parserVersion ?? null,
        parsed: p?.status === "PARSED" ? p.structured : null,
        reviewed: review?.profile ?? null,
        reviewedAt: review?.at ?? null,
      };
    },
    async saveResumeReview(candidateId, documentId, profile) {
      if (!ownResume(candidateId, documentId)) return false;
      if (!(await deps.resumeProfiles?.getByDocument(documentId))) return false;
      reviews.set(documentId, { profile, at: now().toISOString() });
      return true;
    },

    async listDrafts(candidateId) {
      return [...drafts.values()]
        .filter((d) => d.candidateId === candidateId && d.status !== "SUBMITTED")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(clone);
    },
    async getDraft(candidateId, draftId) {
      const d = ownDraft(candidateId, draftId);
      return d ? clone(d) : null;
    },
    async findOpenDraft(candidateId, requisitionId) {
      const d = openDraftFor(candidateId, requisitionId);
      return d ? clone(d) : null;
    },
    async createDraft(candidateId, job: DraftJobSnapshot, write: DraftWrite) {
      const existing = openDraftFor(candidateId, job.requisitionId);
      if (existing) return clone(existing);
      const at = now().toISOString();
      const draft: ApplicationDraft = {
        id: newId("draft"),
        candidateId,
        job,
        status: "DRAFT",
        resumeDocumentId: write.resumeDocumentId,
        payload: write.payload,
        revision: 1,
        submittedApplicationId: null,
        submittingStartedAt: null,
        createdAt: at,
        updatedAt: at,
      };
      drafts.set(draft.id, draft);
      return clone(draft);
    },
    async updateDraft(candidateId, draftId, expectedRevision, write) {
      const d = ownDraft(candidateId, draftId);
      if (!d || d.status !== "DRAFT") return null;
      if (d.revision !== expectedRevision) return "conflict";
      d.payload = write.payload;
      d.resumeDocumentId = write.resumeDocumentId;
      d.revision += 1;
      d.updatedAt = now().toISOString();
      return clone(d);
    },
    async deleteDraft(candidateId, draftId) {
      const d = ownDraft(candidateId, draftId);
      if (!d || d.status !== "DRAFT") return false;
      return drafts.delete(draftId);
    },
    async beginDraftSubmission(candidateId, draftId, at) {
      const d = ownDraft(candidateId, draftId);
      if (!d) return false;
      const free = d.status === "DRAFT" || (d.status === "SUBMITTING" && isLeaseExpired(d.submittingStartedAt, at));
      if (!free) return false;
      d.status = "SUBMITTING";
      d.submittingStartedAt = at.toISOString();
      return true;
    },
    async completeDraftSubmission(candidateId, draftId, applicationId) {
      const d = ownDraft(candidateId, draftId);
      if (!d) return;
      d.status = "SUBMITTED";
      d.submittedApplicationId = applicationId;
      d.updatedAt = now().toISOString();
    },
    async abortDraftSubmission(candidateId, draftId) {
      const d = ownDraft(candidateId, draftId);
      if (d?.status === "SUBMITTING") {
        d.status = "DRAFT";
        d.submittingStartedAt = null;
      }
    },
    async openDraftsUsingResume(candidateId, documentId) {
      return [...drafts.values()].filter(
        (d) => d.candidateId === candidateId && d.status !== "SUBMITTED" && d.resumeDocumentId === documentId,
      ).length;
    },
  };
}
