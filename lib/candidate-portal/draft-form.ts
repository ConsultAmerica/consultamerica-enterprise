import "server-only";

import type { DraftJob, ResumeSelection } from "@/lib/candidate-portal/draft-service";
import { getJobBySlug } from "@/lib/jobs";

/**
 * Form fields shared by "Save draft" and "Submit" on signed-in Detailed Apply:
 *   jobSlug, draftId?, revision?, payload (JSON), resumeChoice, resumeDocumentId?, resume (File)?
 * The job is always resolved server-side from the slug — never trusted from the client.
 */
export type DraftForm = {
  jobSlug: string;
  draftId: string | null;
  expectedRevision: number | null;
  payload: unknown;
  resume: ResumeSelection;
};

export async function readDraftForm(formData: FormData): Promise<DraftForm> {
  const str = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v.trim() : "";
  };
  let payload: unknown = {};
  try {
    payload = JSON.parse(str("payload") || "{}");
  } catch {
    payload = null;
  }
  const revision = Number.parseInt(str("revision"), 10);

  let resume: ResumeSelection = { kind: "keep" };
  const choice = str("resumeChoice");
  const file = formData.get("resume");
  if (choice === "upload" && file instanceof File && file.size > 0) {
    resume = {
      kind: "upload",
      file: {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    };
  } else if (choice === "library" && str("resumeDocumentId")) {
    resume = { kind: "library", documentId: str("resumeDocumentId") };
  } else if (choice === "none") {
    resume = { kind: "none" };
  }

  return {
    jobSlug: str("jobSlug"),
    draftId: str("draftId") || null,
    expectedRevision: Number.isFinite(revision) ? revision : null,
    payload,
    resume,
  };
}

export async function draftJobFromSlug(slug: string): Promise<DraftJob | null> {
  if (!slug) return null;
  const job = await getJobBySlug(slug);
  if (!job) return null;
  return {
    jobId: job.id,
    requisitionId: job.requisitionId || job.id,
    slug: job.slug,
    title: job.title,
    company: job.company,
    acceptingApplications: job.acceptingApplications,
    applicationType: job.applicationType,
  };
}
