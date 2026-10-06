"use server";

import { provisionCandidatePortalAccount } from "@/lib/candidate/provisioning";
import { recruitingRepository } from "@/lib/recruiting";
import type { SubmitApplicationResult } from "@/lib/recruiting/repository";

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
  resumeDocumentId?: string;
  coverLetter?: string;
  additionalInformation?: string;
};

/** Public Easy Apply: creates/matches candidate and files a real application. */
export async function submitJobApplication(
  input: SubmitJobApplicationInput,
  resumeFormData?: FormData | null,
): Promise<SubmitApplicationResult> {
  const additionalInformation = [
    input.location ? `Location: ${input.location}` : null,
    input.currentTitle ? `Current Title: ${input.currentTitle}` : null,
    input.yearsOfExperience
      ? `Years of Experience: ${input.yearsOfExperience}`
      : null,
    input.resumeFileName && !input.resumeDocumentId && !resumeFormData?.get("resume")
      ? `Resume: ${input.resumeFileName}`
      : null,
    input.additionalInformation,
  ]
    .filter(Boolean)
    .join("\n\n");

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
  });

  await provisionCandidatePortalAccount({
    candidateId: result.candidateId,
    email: input.email,
    displayName: `${input.firstName} ${input.lastName}`,
  });

  const {
    linkExistingDocumentToApplication,
    persistResumeForApplication,
  } = await import("@/app/actions/candidate-document-actions");

  try {
    if (input.resumeDocumentId) {
      await linkExistingDocumentToApplication({
        candidateId: result.candidateId,
        applicationId: result.applicationId,
        documentId: input.resumeDocumentId,
      });
    } else {
      const resumeFile = resumeFormData?.get("resume");
      if (resumeFile instanceof File && resumeFile.size > 0) {
        const setAsPrimary = resumeFormData?.get("setAsPrimary") !== "0";
        const bytes = await resumeFile.arrayBuffer();
        await persistResumeForApplication({
          candidateId: result.candidateId,
          applicationId: result.applicationId,
          fileName: resumeFile.name,
          mimeType: resumeFile.type || "application/octet-stream",
          fileSize: resumeFile.size,
          bytes,
          setAsPrimary,
        });
      }
    }
  } catch (error) {
    console.error("Application resume persistence failed:", error);
  }

  return result;
}
