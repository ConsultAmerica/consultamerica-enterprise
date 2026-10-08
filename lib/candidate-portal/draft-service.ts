/**
 * Detailed Apply draft orchestration: save/restore, and the final hand-off to
 * the canonical application service. I/O comes in through `deps`, so the
 * rules are unit-tested against the in-memory store.
 *
 * Invariants:
 *  - A draft is never an application. Nothing here writes `applications`;
 *    only `fileApplication` (lib/recruiting/actions.ts → submitEasyApplication)
 *    does, and it dedupes on (candidate, requisition).
 *  - Ownership comes from the session candidate id on every store call.
 *  - Job eligibility is checked again at final submission (and again inside
 *    the canonical workflow); a closed job leaves the draft intact.
 */

import { ZodError } from "zod";

import {
  decideDraftSubmission,
  parseDraftPayload,
  type ApplicationDraft,
  type DraftJobSnapshot,
} from "@/lib/candidate-portal/drafts";
import type { CandidatePortalStore, CandidateSession, NewResumeFile } from "@/lib/candidate-portal/types";
import { JOB_CLOSED_MESSAGE } from "@/lib/recruiting/errors";
import { validateCandidateDocumentFile } from "@/lib/storage/candidate-documents";

export type DraftJob = DraftJobSnapshot & { acceptingApplications: boolean; applicationType: "INTERNAL" | "EXTERNAL" };

export type ResumeSelection =
  | { kind: "keep" }
  | { kind: "library"; documentId: string }
  | { kind: "upload"; file: NewResumeFile }
  | { kind: "none" };

export type DraftServiceDeps = {
  store: CandidatePortalStore;
  session: CandidateSession;
  now?: () => Date;
};

export type SaveDraftResult =
  | { ok: true; draft: ApplicationDraft; uploadedDocumentId: string | null }
  | { ok: false; error: string; conflict?: boolean };

export const DRAFT_MESSAGES = {
  notFound: "We couldn't find that draft. It may have been submitted or deleted.",
  conflict: "This draft was updated in another window. Reload to see the latest version before saving again.",
  invalid: "Some draft details are invalid. Please review your entries and try again.",
  resumeMissing: "Choose a résumé from your library or upload one before submitting.",
  resumeNotFound: "That résumé is no longer in your library. Please choose another one.",
  inProgress: "Your application is already being submitted. Please wait a moment and check My Applications.",
  locked: "This draft can no longer be edited.",
  alreadyStarted: "You already have a saved draft for this job. Reload the page to continue it.",
} as const;

export async function saveApplicationDraft(
  deps: DraftServiceDeps,
  input: {
    job: DraftJob | null;
    draftId?: string | null;
    expectedRevision?: number | null;
    payload: unknown;
    resume: ResumeSelection;
  },
): Promise<SaveDraftResult> {
  const { store, session } = deps;
  const candidateId = session.candidateId;

  // Re-validated on every save: drafts are only started or edited for jobs that are open.
  if (!input.job || input.job.applicationType !== "INTERNAL" || !input.job.acceptingApplications) {
    return { ok: false, error: JOB_CLOSED_MESSAGE };
  }

  let payload;
  try {
    payload = parseDraftPayload(input.payload);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return { ok: false, error: DRAFT_MESSAGES.invalid };
    throw error;
  }

  const existing = input.draftId ? await store.getDraft(candidateId, input.draftId) : null;
  if (input.draftId && !existing) return { ok: false, error: DRAFT_MESSAGES.notFound };
  if (existing && existing.job.requisitionId !== input.job.requisitionId) return { ok: false, error: DRAFT_MESSAGES.notFound };
  if (existing && existing.status !== "DRAFT") return { ok: false, error: DRAFT_MESSAGES.locked };
  if (existing && input.expectedRevision != null && existing.revision !== input.expectedRevision) {
    return { ok: false, error: DRAFT_MESSAGES.conflict, conflict: true };
  }

  let resumeDocumentId: string | null = existing?.resumeDocumentId ?? null;
  let uploadedDocumentId: string | null = null;
  if (input.resume.kind === "none") resumeDocumentId = null;
  if (input.resume.kind === "library") {
    const { documentId } = input.resume;
    const owned = (await store.listResumes(candidateId)).some((r) => r.documentId === documentId);
    if (!owned) return { ok: false, error: DRAFT_MESSAGES.resumeNotFound };
    resumeDocumentId = documentId;
  }
  if (input.resume.kind === "upload") {
    const { file } = input.resume;
    const validation = validateCandidateDocumentFile({ fileName: file.fileName, mimeType: file.mimeType, fileSize: file.fileSize });
    if (!validation.ok) return { ok: false, error: validation.error };
    // Stored privately in the candidate's library (not as default), so the draft can be resumed on any device.
    const uploaded = await store.uploadResume(candidateId, { ...file, mimeType: validation.mimeType }, { makeDefault: false });
    resumeDocumentId = uploaded.documentId;
    uploadedDocumentId = uploaded.documentId;
  }

  const write = { payload, resumeDocumentId };
  if (!existing) {
    // A form opened before another tab started a draft for this job must not overwrite it.
    if (await store.findOpenDraft(candidateId, input.job.requisitionId)) {
      return { ok: false, error: DRAFT_MESSAGES.alreadyStarted, conflict: true };
    }
    const draft = await store.createDraft(candidateId, snapshotOf(input.job), write);
    return { ok: true, draft, uploadedDocumentId };
  }

  const updated = await store.updateDraft(candidateId, existing.id, existing.revision, write);
  if (updated === "conflict") return { ok: false, error: DRAFT_MESSAGES.conflict, conflict: true };
  if (!updated) return { ok: false, error: DRAFT_MESSAGES.locked };
  return { ok: true, draft: updated, uploadedDocumentId };
}

export type FiledApplication = { ok: true; applicationId: string; applicationNumber: string; candidateId: string } | { ok: false; error: string };

export type SubmitDraftResult =
  | { ok: true; applicationId: string; applicationNumber: string; alreadySubmitted: boolean }
  | { ok: false; error: string };

/**
 * Final submission. `isJobOpen` re-checks eligibility; `file` is the canonical
 * application service (it re-checks eligibility again and never duplicates).
 * Exactly one attempt holds the SUBMITTING lease at a time; any failure
 * releases it so the candidate can retry from the same draft.
 */
export async function submitApplicationDraft(
  deps: DraftServiceDeps,
  draftId: string,
  ports: {
    isJobOpen: (draft: ApplicationDraft) => Promise<boolean>;
    file: (draft: ApplicationDraft & { resumeDocumentId: string }) => Promise<FiledApplication>;
    applicationNumberFor?: (applicationId: string) => Promise<string | null>;
  },
): Promise<SubmitDraftResult> {
  const { store, session } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const draft = await store.getDraft(session.candidateId, draftId);
  if (!draft) return { ok: false, error: DRAFT_MESSAGES.notFound };

  const decision = decideDraftSubmission(draft, now);
  if (decision.action === "already-submitted") {
    const number = (await ports.applicationNumberFor?.(decision.applicationId)) ?? "";
    return { ok: true, applicationId: decision.applicationId, applicationNumber: number, alreadySubmitted: true };
  }
  if (decision.action === "in-progress") return { ok: false, error: DRAFT_MESSAGES.inProgress };

  const resumeDocumentId = draft.resumeDocumentId;
  if (!resumeDocumentId) return { ok: false, error: DRAFT_MESSAGES.resumeMissing };
  const contact = draft.payload.contact;
  if (!contact.firstName || !contact.lastName || !contact.phone) {
    return { ok: false, error: "Please complete your name and phone number before submitting." };
  }
  if (!(await ports.isJobOpen(draft))) return { ok: false, error: JOB_CLOSED_MESSAGE };

  if (!(await store.beginDraftSubmission(session.candidateId, draft.id, now))) {
    return { ok: false, error: DRAFT_MESSAGES.inProgress };
  }

  let filed: FiledApplication;
  try {
    filed = await ports.file({ ...draft, resumeDocumentId });
  } catch (error) {
    await store.abortDraftSubmission(session.candidateId, draft.id);
    throw error;
  }
  if (!filed.ok) {
    await store.abortDraftSubmission(session.candidateId, draft.id);
    return filed;
  }
  await store.completeDraftSubmission(session.candidateId, draft.id, filed.applicationId);
  return { ok: true, applicationId: filed.applicationId, applicationNumber: filed.applicationNumber, alreadySubmitted: false };
}

export async function deleteApplicationDraft(deps: DraftServiceDeps, draftId: string): Promise<{ ok: boolean; error?: string }> {
  const draft = await deps.store.getDraft(deps.session.candidateId, draftId);
  if (!draft) return { ok: false, error: DRAFT_MESSAGES.notFound };
  if (draft.status !== "DRAFT") return { ok: false, error: DRAFT_MESSAGES.locked };
  // The résumé stays in the library; only the unfinished application is removed.
  const deleted = await deps.store.deleteDraft(deps.session.candidateId, draftId);
  return deleted ? { ok: true } : { ok: false, error: DRAFT_MESSAGES.locked };
}

function snapshotOf(job: DraftJob): DraftJobSnapshot {
  return { jobId: job.jobId, requisitionId: job.requisitionId, slug: job.slug, title: job.title, company: job.company };
}
