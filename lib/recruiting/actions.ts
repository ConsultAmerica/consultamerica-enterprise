"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";

import { checkPublicRateLimit, clientIp } from "@/lib/assistant/rate-limit";

import { recruitingRepository } from "@/lib/recruiting";
import { JobClosedError } from "@/lib/recruiting/errors";
import { logEasyApplyEvent } from "@/lib/recruiting/easy-apply";
import type { SubmitApplicationResult } from "@/lib/recruiting/repository";
import { validateCandidateDocumentFile } from "@/lib/storage/candidate-documents";

export type SubmitJobApplicationInput = {
  requisitionId: string;
  postingId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  currentTitle?: string;
  yearsOfExperience?: string;
  workAuthorization?: string;
  willingToRelocate?: "yes" | "no" | "maybe";
  resumeFileName?: string;
  coverLetter?: string;
  additionalInformation?: string;
};

/**
 * What an anonymous submitter gets back. No internal ids, and the reference
 * number only for an application this request created: the email address is
 * unverified, so "already applied" must not reveal someone else's application.
 */
export type SubmitJobApplicationResponse =
  | { ok: true; applicationNumber: string }
  | { ok: false; error: string };

/** Internal result of the canonical submission (signed-in paths need the ids). */
type FiledApplicationResponse =
  | ({ ok: true } & SubmitApplicationResult)
  | { ok: false; error: string };

function publicResponse(filed: FiledApplicationResponse): SubmitJobApplicationResponse {
  if (!filed.ok) return filed;
  return { ok: true, applicationNumber: filed.outcome === "created" ? filed.applicationNumber : "" };
}

/**
 * Anonymous submissions may trigger a portal invitation email to the address
 * typed in the form; cap that per client so the form can't be used to flood
 * inboxes or exhaust the Auth email quota. The submission itself is never
 * limited here, and a missing limiter store (migration 045) doesn't block
 * invitations — Supabase Auth's own email rate limit still applies.
 */
async function anonymousInviteAllowed(): Promise<boolean> {
  try {
    const decision = await checkPublicRateLimit("candidate-invite", clientIp(await headers()));
    if (decision.allowed || decision.reason === "store-unavailable") return true;
    console.warn("[easy-apply]", { event: "portal-invite-rate-limited", reason: decision.reason });
    return false;
  } catch {
    return true;
  }
}

const INCOMPLETE_MESSAGE = "We couldn't complete your application. Please try again.";
const RESUME_REQUIRED_MESSAGE = "Please upload your resume (PDF, DOC, or DOCX).";

/**
 * Public Easy Apply. Success is returned only after the candidate, the
 * application, the privately stored resume, its document metadata and the
 * application→resume link all exist (see lib/recruiting/easy-apply.ts).
 *
 * Returns a result instead of throwing: production builds redact thrown
 * Server Action messages, and storage/database details must never reach the
 * candidate. Failures are logged server-side under [easy-apply].
 */
export async function submitJobApplication(
  input: SubmitJobApplicationInput,
  resumeFormData?: FormData | null,
): Promise<SubmitJobApplicationResponse> {
  return publicResponse(await fileApplication(input, { kind: "upload", formData: resumeFormData }, { source: "Careers Site" }));
}

/**
 * Detailed Apply: the same canonical submission (candidate → application →
 * private resume → link) plus the candidate-reviewed profile snapshot. The
 * snapshot is part of success; if it fails, the candidate sees the standard
 * retry message and a retry completes the same application (no duplicate).
 */
export async function submitDetailedApplication(
  input: SubmitJobApplicationInput,
  formData: FormData,
): Promise<SubmitJobApplicationResponse> {
  const { detailedProfileSchema, saveApplicationSnapshot } = await import("@/lib/recruiting/application-snapshots");
  let profile;
  let answers: { question: string; answer: string }[] = [];
  try {
    profile = detailedProfileSchema.parse(JSON.parse(String(formData.get("profile") ?? "{}")));
    const rawAnswers = JSON.parse(String(formData.get("answers") ?? "[]")) as unknown;
    if (Array.isArray(rawAnswers)) {
      answers = rawAnswers
        .filter((a): a is { question: string; answer: string } => typeof a?.question === "string" && typeof a?.answer === "string")
        .slice(0, 20)
        .map((a) => ({ question: a.question.slice(0, 300), answer: a.answer.slice(0, 2000) }));
    }
  } catch {
    return { ok: false, error: "Please review your profile details and try again." };
  }
  return publicResponse(await fileApplication(
    { ...input, portfolioUrl: input.portfolioUrl || profile.portfolioUrl || undefined },
    { kind: "upload", formData },
    {
      source: "Careers Site — Detailed Apply",
      onApplied: (result) =>
        saveApplicationSnapshot({ applicationId: result.applicationId, candidateId: result.candidateId, profile, answers }),
    },
  ));
}

/**
 * Where the application's résumé comes from: a file uploaded with this
 * request (anonymous Easy/Detailed Apply), or a document already in the
 * signed-in candidate's private library (Detailed Apply drafts).
 */
type ResumeSource =
  | { kind: "upload"; formData: FormData | null | undefined }
  | { kind: "library"; documentId: string };

type UploadedResume = { file: File; mimeType: string; bytes: Uint8Array };

/** The one canonical submission path behind every apply flow. */
async function fileApplication(
  input: SubmitJobApplicationInput,
  resumeSource: ResumeSource,
  options: {
    source: string;
    /** Server-resolved signed-in candidate; never derived from client input. */
    sessionCandidateId?: string;
    onApplied?: (result: SubmitApplicationResult) => Promise<void>;
  },
): Promise<FiledApplicationResponse> {
  let upload: UploadedResume | null = null;
  if (resumeSource.kind === "upload") {
    const resumeFile = resumeSource.formData?.get("resume");
    if (!(resumeFile instanceof File) || resumeFile.size === 0) {
      return { ok: false, error: RESUME_REQUIRED_MESSAGE };
    }
    const validation = validateCandidateDocumentFile({
      fileName: resumeFile.name,
      mimeType: resumeFile.type || "application/octet-stream",
      fileSize: resumeFile.size,
    });
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }
    upload = { file: resumeFile, mimeType: validation.mimeType, bytes: new Uint8Array(await resumeFile.arrayBuffer()) };
  } else if (!options.sessionCandidateId) {
    return { ok: false, error: RESUME_REQUIRED_MESSAGE };
  }

  const additionalInformation = [
    input.location ? `Location: ${input.location}` : null,
    input.currentTitle ? `Current Title: ${input.currentTitle}` : null,
    input.yearsOfExperience ? `Years of Experience: ${input.yearsOfExperience}` : null,
    input.additionalInformation,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const result = await recruitingRepository.submitApplication({
      requisitionId: input.requisitionId,
      postingId: input.postingId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      linkedinUrl: input.linkedinUrl,
      portfolioUrl: input.portfolioUrl,
      workAuthorization: input.workAuthorization,
      willingToRelocate: input.willingToRelocate === "yes",
      coverLetter: input.coverLetter,
      additionalInformation: additionalInformation || undefined,
      source: options.source,
      resume: upload
        ? { fileName: upload.file.name, mimeType: upload.mimeType, fileSize: upload.file.size, bytes: upload.bytes }
        : undefined,
      sessionCandidateId: options.sessionCandidateId,
      libraryResumeDocumentId: resumeSource.kind === "library" ? resumeSource.documentId : undefined,
      allowPortalInvite: options.sessionCandidateId ? false : await anonymousInviteAllowed(),
    });
    if (options.onApplied) await options.onApplied(result);
    revalidatePath(`/app/recruiting/candidates/${result.candidateId}`);
    schedulePostSubmissionWork(input, result, upload, options.source);
    return {
      ok: true,
      candidateId: result.candidateId,
      applicationId: result.applicationId,
      applicationNumber: result.applicationNumber,
      outcome: result.outcome,
    };
  } catch (error) {
    if (error instanceof JobClosedError) {
      return { ok: false, error: error.message };
    }
    // Stage failures are already logged by the workflow; this catches anything else.
    if (!(error instanceof Error && error.name === "EasyApplyStageError")) {
      logEasyApplyEvent({
        stage: "application",
        level: "error",
        message: "unexpected submission failure",
        postingId: input.postingId,
        error,
      });
    }
    return { ok: false, error: INCOMPLETE_MESSAGE };
  }
}

export type SaveApplicationDraftResponse =
  | { ok: true; draftId: string; revision: number; savedAt: string; resume: { documentId: string; fileName: string } | null }
  | { ok: false; error: string; conflict?: boolean };

export type SubmitApplicationDraftResponse =
  | { ok: true; draftId: string; applicationId: string; applicationNumber: string; alreadySubmitted: boolean }
  | { ok: false; error: string; conflict?: boolean };

const SIGN_IN_MESSAGE = "Please sign in to your candidate account to continue.";

/** Signed-in Detailed Apply: save progress without creating an application. */
export async function saveDetailedApplicationDraft(formData: FormData): Promise<SaveApplicationDraftResponse> {
  const portal = await loadCandidatePortal();
  if (!portal) return { ok: false, error: SIGN_IN_MESSAGE };
  const { session, store, readDraftForm, draftJobFromSlug, saveApplicationDraft } = portal;
  try {
    const form = await readDraftForm(formData);
    const saved = await saveApplicationDraft({ store, session }, { ...form, job: await draftJobFromSlug(form.jobSlug) });
    if (!saved.ok) return saved;
    if (saved.uploadedDocumentId) scheduleUploadedResumeParse(session.candidateId, saved.uploadedDocumentId, form.resume);
    revalidatePath("/candidate/drafts");
    return {
      ok: true,
      draftId: saved.draft.id,
      revision: saved.draft.revision,
      savedAt: saved.draft.updatedAt,
      resume: await libraryResumeLabel(portal, saved.draft.resumeDocumentId),
    };
  } catch (error) {
    console.error("[application-draft]", { event: "save-failed", error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "We couldn't save your draft. Please try again." };
  }
}

/**
 * Signed-in Detailed Apply final submission: saves the latest state, then
 * files it through fileApplication — the same canonical service as Easy
 * Apply — on the session candidate's own record, with the library résumé the
 * draft selected. The draft becomes SUBMITTED only after the application exists.
 */
export async function submitDetailedApplicationDraft(formData: FormData): Promise<SubmitApplicationDraftResponse> {
  const portal = await loadCandidatePortal();
  if (!portal) return { ok: false, error: SIGN_IN_MESSAGE };
  const { session, store, readDraftForm, draftJobFromSlug, saveApplicationDraft, submitApplicationDraft } = portal;
  try {
    const form = await readDraftForm(formData);
    const saved = await saveApplicationDraft({ store, session }, { ...form, job: await draftJobFromSlug(form.jobSlug) });
    if (!saved.ok) return saved;
    if (saved.uploadedDocumentId) scheduleUploadedResumeParse(session.candidateId, saved.uploadedDocumentId, form.resume);

    const { saveApplicationSnapshot } = await import("@/lib/recruiting/application-snapshots");
    const result = await submitApplicationDraft({ store, session }, saved.draft.id, {
      isJobOpen: async (draft) => (await draftJobFromSlug(draft.job.slug))?.acceptingApplications ?? false,
      applicationNumberFor: async (applicationId) =>
        (await store.listApplications(session.candidateId)).find((a) => a.applicationId === applicationId)?.applicationNumber ?? null,
      file: async (draft) => {
        const { contact, profile, answers } = draft.payload;
        const filed = await fileApplication(
          {
            requisitionId: draft.job.requisitionId,
            postingId: draft.job.jobId,
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: session.email,
            phone: contact.phone,
            location: contact.location || undefined,
            linkedinUrl: contact.linkedinUrl || undefined,
            portfolioUrl: contact.portfolioUrl || profile.portfolioUrl || undefined,
          },
          { kind: "library", documentId: draft.resumeDocumentId },
          {
            source: "Careers Site — Detailed Apply",
            sessionCandidateId: session.candidateId,
            onApplied: (applied) =>
              saveApplicationSnapshot({ applicationId: applied.applicationId, candidateId: applied.candidateId, profile, answers }),
          },
        );
        if (!filed.ok) return filed;
        if (session.demo) await recordDemoApplication(portal, draft, filed);
        return { ok: true, applicationId: filed.applicationId, applicationNumber: filed.applicationNumber, candidateId: filed.candidateId };
      },
    });
    revalidatePath("/candidate");
    revalidatePath("/candidate/drafts");
    revalidatePath("/candidate/applications");
    return result.ok ? { ...result, draftId: saved.draft.id } : result;
  } catch (error) {
    console.error("[application-draft]", { event: "submit-failed", error: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: INCOMPLETE_MESSAGE };
  }
}

async function loadCandidatePortal() {
  const [{ getCandidateSession }, { getCandidatePortalStore }, form, service] = await Promise.all([
    import("@/lib/candidate-portal/session"),
    import("@/lib/candidate-portal/store"),
    import("@/lib/candidate-portal/draft-form"),
    import("@/lib/candidate-portal/draft-service"),
  ]);
  const session = await getCandidateSession();
  if (!session) return null;
  return { session, store: getCandidatePortalStore(), ...form, ...service };
}

type CandidatePortalContext = NonNullable<Awaited<ReturnType<typeof loadCandidatePortal>>>;

async function libraryResumeLabel(portal: CandidatePortalContext, documentId: string | null) {
  if (!documentId) return null;
  const resume = (await portal.store.listResumes(portal.session.candidateId)).find((r) => r.documentId === documentId);
  return resume ? { documentId, fileName: resume.fileName } : null;
}

/** Local demo only: the in-memory ATS has no candidate link, so mirror the application into the portal store. */
async function recordDemoApplication(
  portal: CandidatePortalContext,
  draft: { job: { title: string; slug: string; company: string }; resumeDocumentId: string },
  filed: { applicationId: string; applicationNumber: string },
) {
  const { getDemoCandidatePortalStore } = await import("@/lib/candidate-portal/store");
  getDemoCandidatePortalStore().recordApplication(portal.session.candidateId, {
    applicationId: filed.applicationId,
    applicationNumber: filed.applicationNumber,
    status: "APPLIED",
    appliedAt: new Date().toISOString(),
    updatedAt: null,
    job: { title: draft.job.title, slug: draft.job.slug, company: draft.job.company },
    resume: await libraryResumeLabel(portal, draft.resumeDocumentId),
  });
}

function scheduleUploadedResumeParse(
  candidateId: string,
  documentId: string,
  resume: { kind: string; file?: { fileName: string; bytes: Uint8Array } },
) {
  if (resume.kind === "upload" && resume.file) {
    scheduleResumeParse(candidateId, documentId, resume.file.fileName, resume.file.bytes);
  }
}

/**
 * Everything that happens once the application is safely filed: résumé
 * parsing and the two application emails. Both are enrichment — the
 * application already exists — so they share one after() pass, each task is
 * independently try/caught, and nothing here can change what the candidate
 * was told or fail the submission.
 */
function schedulePostSubmissionWork(
  input: SubmitJobApplicationInput,
  result: SubmitApplicationResult,
  upload: UploadedResume | null,
  source: string,
) {
  // Library résumés were parsed when they entered the library.
  const resume =
    upload && result.resumeDocumentId && result.outcome !== "existing"
      ? { documentId: result.resumeDocumentId, fileName: upload.file.name, bytes: upload.bytes }
      : null;
  // Mail only an application this request created. "existing" and "recovered"
  // both mean the row was already there: re-confirming is noise, and it would
  // tell whoever typed the address that it had applied before.
  const mail = result.outcome === "created";
  if (!resume && !mail) return;

  try {
    after(async () => {
      if (resume) await parseResumeDocument(result.candidateId, resume.documentId, resume.fileName, resume.bytes);
      if (mail) await mailApplication(input, result, source);
    });
  } catch (error) {
    // This is called inside fileApplication's try, so a throw from after()
    // itself would turn a filed application into a retry message. Scheduling
    // post-response work is never worth that.
    console.error("[easy-apply]", {
      event: "post-submission-scheduling-failed",
      applicationId: result.applicationId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

/**
 * The internal notification and the candidate confirmation. Runs after the
 * response, and every failure — unreachable mail provider, missing API key,
 * rejected address — is logged and swallowed: a filed application must never
 * be lost or reported as failed because an email did not go out.
 */
async function mailApplication(
  input: SubmitJobApplicationInput,
  result: SubmitApplicationResult,
  source: string,
) {
  try {
    const [{ sendApplicationEmails }, requisition] = await Promise.all([
      import("@/lib/email/application-emails"),
      // The apply forms never submit a job title, and client input would not
      // be trustworthy anyway: read it off the requisition that was applied to.
      recruitingRepository.getRequisitionById(input.requisitionId),
    ]);
    const sent = await sendApplicationEmails({
      candidateName: `${input.firstName} ${input.lastName}`.trim(),
      candidateEmail: input.email,
      candidatePhone: input.phone,
      jobTitle: requisition?.title || "Open position",
      applicationId: result.applicationId,
      applicationNumber: result.applicationNumber,
      source,
    });
    console.info("[application-email]", { event: "sent", applicationId: result.applicationId, ...sent });
  } catch (error) {
    console.error("[application-email]", {
      event: "send-failed",
      applicationId: result.applicationId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

/**
 * Resume → profile parsing. Enrichment: the application is already complete,
 * and a parse failure is recorded on the resume profile and logged, never
 * surfaced to the candidate.
 */
async function parseResumeDocument(candidateId: string, documentId: string, fileName: string, bytes: Uint8Array) {
  try {
    const { parseAndStoreResume } = await import("@/lib/recruiting/resume-profiles-server");
    const outcome = await parseAndStoreResume({ candidateId, documentId, fileName, bytes });
    console.info("[resume-parser]", { event: "parsed", documentId, status: outcome.status });
  } catch (error) {
    console.error("[resume-parser]", {
      event: "parse-failed",
      documentId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

/** Draft saves file no application, so their parse is scheduled on its own. */
function scheduleResumeParse(candidateId: string, documentId: string, fileName: string, bytes: Uint8Array) {
  after(() => parseResumeDocument(candidateId, documentId, fileName, bytes));
}
