/**
 * Easy Apply submission workflow.
 *
 * Storage and Postgres are not one transaction, so the workflow is ordered to
 * keep partial state small and recoverable:
 *
 *   job eligibility → candidate (session / create / reuse) → portal account (best effort)
 *   → existing application?  complete: return it (no duplicate)
 *                            missing resume: recover by attaching one
 *   → resume object (private storage) → document metadata
 *   → application → application/document link → verify link
 *   → submission activity + status history (best effort)
 *
 * The resume is persisted BEFORE the application row exists, so an upload or
 * metadata failure never leaves an application behind. If the link fails
 * after the application was created, the application created by this attempt
 * is removed again (compensation); if that also fails, a retry finds the
 * application without a resume and completes it instead of duplicating it.
 *
 * Success is returned only once candidate, application, stored resume,
 * document metadata and the application→resume link all exist.
 */

import { JobClosedError } from "@/lib/recruiting/errors";

export type EasyApplyStage =
  | "job-lookup"
  | "candidate"
  | "portal-account"
  | "application"
  | "resume-upload"
  | "document-metadata"
  | "document-link"
  | "primary-resume"
  | "submission-record"
  | "cleanup";

export class EasyApplyStageError extends Error {
  readonly stage: EasyApplyStage;

  constructor(stage: EasyApplyStage, cause: unknown) {
    super(`Easy Apply failed at stage "${stage}"`, { cause });
    this.name = "EasyApplyStageError";
    this.stage = stage;
  }
}

export type EasyApplyResume = {
  fileName: string;
  mimeType: string;
  fileSize: number;
  bytes: ArrayBuffer | Uint8Array;
};

export type EasyApplyInput = {
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
  /** A new upload. Required unless libraryResumeDocumentId is set. */
  resume?: EasyApplyResume;
  /**
   * Server-only: the signed-in candidate's id from the session (never client
   * input). Replaces the email lookup, so the application is filed on the
   * authenticated candidate's own record.
   */
  sessionCandidateId?: string;
  /**
   * Server-only, with sessionCandidateId: an ACTIVE résumé already in that
   * candidate's library. It is linked as-is (no new upload), is never
   * removed by failure compensation, and does not change the default résumé.
   */
  libraryResumeDocumentId?: string;
  /**
   * Server-only: false skips the portal invitation email for this submission
   * (the public action rate-limits invitations per client). Default true.
   */
  allowPortalInvite?: boolean;
};

export type EasyApplyResult = {
  candidateId: string;
  applicationId: string;
  applicationNumber: string;
  /** "created" (new), "existing" (already complete), "recovered" (resume attached on retry). */
  outcome: "created" | "existing" | "recovered";
  /** The resume document linked to the application. */
  resumeDocumentId: string;
};

export type ExistingApplication = { id: string; applicationNumber: string };

/** Persistence operations. Every method throws on failure; none swallow errors. */
export type EasyApplyPorts = {
  /** Throws on lookup failure; resolves false when the job is missing or not open. */
  isJobOpen(postingId: string): Promise<boolean>;
  findCandidateIdByEmail(email: string): Promise<string | null>;
  /** True when the candidate record is bound to an ACTIVATED portal account (profile status ACTIVE). */
  hasActivatedAccount(candidateId: string): Promise<boolean>;
  /** True when documentId is an ACTIVE résumé document owned by candidateId. */
  findLibraryResume(input: { candidateId: string; documentId: string }): Promise<boolean>;
  createCandidate(input: { id: string; data: EasyApplyInput; now: string }): Promise<void>;
  ensurePortalAccount(input: { candidateId: string; email: string; displayName: string }): Promise<void>;
  findApplication(candidateId: string, requisitionId: string): Promise<ExistingApplication | null>;
  /** Document id of the application's RESUME link, or null. */
  findResumeLink(applicationId: string): Promise<string | null>;
  /** Uploads to private storage and returns the storage path. */
  uploadResumeObject(input: { candidateId: string; documentId: string; resume: EasyApplyResume }): Promise<string>;
  removeResumeObject(storagePath: string): Promise<void>;
  insertResumeDocument(input: {
    documentId: string;
    candidateId: string;
    storagePath: string;
    resume: EasyApplyResume;
    now: string;
  }): Promise<void>;
  removeResumeDocument(documentId: string): Promise<void>;
  createApplication(input: {
    id: string;
    applicationNumber: string;
    candidateId: string;
    data: EasyApplyInput;
    now: string;
  }): Promise<void>;
  deleteApplication(applicationId: string): Promise<void>;
  linkResume(input: { applicationId: string; documentId: string; now: string }): Promise<void>;
  /** Makes documentId the only primary resume for the candidate. */
  markPrimaryResume(input: { candidateId: string; documentId: string; now: string }): Promise<void>;
  recordSubmission(input: {
    candidateId: string;
    applicationId: string;
    requisitionId: string;
    now: string;
  }): Promise<void>;
};

export type EasyApplyLogEvent = {
  stage: EasyApplyStage;
  level: "error" | "warn";
  message: string;
  postingId: string;
  candidateId?: string;
  applicationId?: string;
  documentId?: string;
  error?: unknown;
};

export type EasyApplyDeps = {
  ports: EasyApplyPorts;
  log?: (event: EasyApplyLogEvent) => void;
  newId?: (prefix: string) => string;
  now?: () => string;
};

/** Structured server-side log. Ids only — never resume contents, emails or secrets. */
export function logEasyApplyEvent(event: EasyApplyLogEvent): void {
  const { error, ...rest } = event;
  const detail =
    error instanceof Error
      ? { error: error.message, cause: error.cause instanceof Error ? error.cause.message : undefined }
      : error !== undefined
        ? { error: String(error) }
        : {};
  const line = { ...rest, ...detail };
  if (event.level === "warn") console.warn("[easy-apply]", line);
  else console.error("[easy-apply]", line);
}

const defaultNewId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export async function submitEasyApplication(
  input: EasyApplyInput,
  deps: EasyApplyDeps,
): Promise<EasyApplyResult> {
  const { ports } = deps;
  const log = deps.log ?? logEasyApplyEvent;
  const newId = deps.newId ?? defaultNewId;
  const now = (deps.now ?? (() => new Date().toISOString()))();
  const ctx = { postingId: input.postingId } as {
    postingId: string;
    candidateId?: string;
    applicationId?: string;
    documentId?: string;
  };
  const storagePathFor = new Map<string, string>();

  async function step<T>(stage: EasyApplyStage, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof JobClosedError || error instanceof EasyApplyStageError) throw error;
      log({ stage, level: "error", message: "required step failed", ...ctx, error });
      throw new EasyApplyStageError(stage, error);
    }
  }

  async function bestEffort(stage: EasyApplyStage, message: string, run: () => Promise<void>) {
    try {
      await run();
    } catch (error) {
      log({ stage, level: "warn", message, ...ctx, error });
    }
  }

  // 1. Job must still accept applications. A lookup failure is a fault, not "closed".
  const open = await step("job-lookup", () => ports.isJobOpen(input.postingId));
  if (!open) throw new JobClosedError();

  // 2. Candidate: the signed-in candidate, else reuse by email, else create.
  //    An anonymous submission filed onto a record that already has an
  //    activated account (the email is not verified here) must not change
  //    that account: no invitation, and the default résumé stays the owner's.
  const email = input.email.trim();
  const libraryDocumentId = input.sessionCandidateId ? input.libraryResumeDocumentId : undefined;
  let anonymousOnActivatedAccount = false;
  const candidateId = input.sessionCandidateId ?? (await step("candidate", async () => {
    const existing = await ports.findCandidateIdByEmail(email.toLowerCase());
    if (existing) {
      anonymousOnActivatedAccount = await ports.hasActivatedAccount(existing);
      return existing;
    }
    const id = newId("cand");
    await ports.createCandidate({ id, data: input, now });
    return id;
  }));
  ctx.candidateId = candidateId;

  // 3. Portal sign-in invite. Never blocks the submission.
  if (!anonymousOnActivatedAccount && input.allowPortalInvite !== false) {
    await bestEffort("portal-account", "portal account provisioning failed", () =>
      ports.ensurePortalAccount({
        candidateId,
        email,
        displayName: `${input.firstName} ${input.lastName}`.trim(),
      }),
    );
  }

  // 4. Existing application for this requisition: never create a duplicate.
  const existing = await step("application", () =>
    ports.findApplication(candidateId, input.requisitionId),
  );
  if (existing) {
    ctx.applicationId = existing.id;
    const linked = await step("document-link", () => ports.findResumeLink(existing.id));
    if (linked) {
      return { candidateId, applicationId: existing.id, applicationNumber: existing.applicationNumber, outcome: "existing", resumeDocumentId: linked };
    }
    // Partial earlier attempt: attach the resume and complete it.
    const documentId = await persistResume();
    await linkAndVerify(existing.id, documentId, { compensateApplication: false });
    await promotePrimary(documentId);
    return { candidateId, applicationId: existing.id, applicationNumber: existing.applicationNumber, outcome: "recovered", resumeDocumentId: documentId };
  }

  // 5. New application: resume first, so a storage/metadata failure leaves no application.
  const documentId = await persistResume();

  const applicationId = newId("app");
  const applicationNumber = `APP-${now.slice(0, 4)}-${newId("n").slice(-4).toUpperCase()}`;
  await step("application", async () => {
    try {
      await ports.createApplication({ id: applicationId, applicationNumber, candidateId, data: input, now });
    } catch (error) {
      await discardResume(documentId, storagePathFor.get(documentId));
      throw error;
    }
  });
  ctx.applicationId = applicationId;

  await linkAndVerify(applicationId, documentId, { compensateApplication: true });

  // 6. Enrichment / audit trail. Logged on failure, never blocks success.
  await promotePrimary(documentId);
  await bestEffort("submission-record", "activity/status history insert failed", () =>
    ports.recordSubmission({ candidateId, applicationId, requisitionId: input.requisitionId, now }),
  );

  return { candidateId, applicationId, applicationNumber, outcome: "created", resumeDocumentId: documentId };

  // --- helpers (hoisted) -------------------------------------------------

  async function persistResume(): Promise<string> {
    if (libraryDocumentId) {
      ctx.documentId = libraryDocumentId;
      await step("document-metadata", async () => {
        const owned = await ports.findLibraryResume({ candidateId, documentId: libraryDocumentId });
        if (!owned) throw new Error("library resume not found for candidate");
      });
      return libraryDocumentId;
    }
    const resume = input.resume;
    if (!resume) {
      return step("resume-upload", () => Promise.reject(new Error("no resume provided")));
    }
    const docId = newId("doc");
    ctx.documentId = docId;
    const storagePath = await step("resume-upload", () =>
      ports.uploadResumeObject({ candidateId, documentId: docId, resume }),
    );
    storagePathFor.set(docId, storagePath);
    await step("document-metadata", async () => {
      try {
        await ports.insertResumeDocument({ documentId: docId, candidateId, storagePath, resume, now });
      } catch (error) {
        await removeObject(storagePath);
        throw error;
      }
    });
    return docId;
  }

  async function linkAndVerify(
    appId: string,
    docId: string,
    options: { compensateApplication: boolean },
  ): Promise<void> {
    await step("document-link", async () => {
      try {
        await ports.linkResume({ applicationId: appId, documentId: docId, now });
        const linked = await ports.findResumeLink(appId);
        if (linked !== docId) {
          throw new Error("resume link verification failed");
        }
      } catch (error) {
        if (options.compensateApplication) {
          await bestEffort("cleanup", "could not remove application created by failed attempt", () =>
            ports.deleteApplication(appId),
          );
        }
        await discardResume(docId, storagePathFor.get(docId));
        throw error;
      }
    });
  }

  /** A library résumé keeps the candidate's chosen default; a new upload becomes the default. */
  async function promotePrimary(docId: string) {
    if (docId === libraryDocumentId || anonymousOnActivatedAccount) return;
    await bestEffort("primary-resume", "primary resume flag update failed", () =>
      ports.markPrimaryResume({ candidateId, documentId: docId, now }),
    );
  }

  async function discardResume(docId: string, storagePath?: string) {
    // Never compensate away a document this attempt did not create.
    if (docId === libraryDocumentId) return;
    await bestEffort("cleanup", "could not remove unlinked resume metadata", () =>
      ports.removeResumeDocument(docId),
    );
    if (storagePath) await removeObject(storagePath);
  }

  async function removeObject(storagePath: string) {
    await bestEffort("cleanup", "could not remove uploaded resume object", () =>
      ports.removeResumeObject(storagePath),
    );
  }
}

