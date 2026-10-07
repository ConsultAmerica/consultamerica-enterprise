"use server";

import { revalidatePath } from "next/cache";

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

export type SubmitJobApplicationResponse =
  | ({ ok: true } & SubmitApplicationResult)
  | { ok: false; error: string };

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
  const resumeFile = resumeFormData?.get("resume");
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
      source: "Careers Site",
      resume: {
        fileName: resumeFile.name,
        mimeType: validation.mimeType,
        fileSize: resumeFile.size,
        bytes: await resumeFile.arrayBuffer(),
      },
    });
    revalidatePath(`/app/recruiting/candidates/${result.candidateId}`);
    return {
      ok: true,
      candidateId: result.candidateId,
      applicationId: result.applicationId,
      applicationNumber: result.applicationNumber,
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
