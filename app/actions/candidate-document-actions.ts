"use server";

import { revalidatePath } from "next/cache";

import {
  linkDocumentToApplication,
  uploadCandidateDocument,
} from "@/lib/documents/candidate-documents-service";

function revalidateDocumentViews(candidateId: string) {
  revalidatePath(`/jobs`);
  revalidatePath(`/app/recruiting/candidates/${candidateId}`);
}

/** Persist a resume uploaded during Easy Apply (service-role path). */
export async function persistResumeForApplication(input: {
  candidateId: string;
  applicationId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  bytes: ArrayBuffer;
  setAsPrimary?: boolean;
}): Promise<{ ok: true; documentId: string } | { ok: false; message: string }> {
  const result = await uploadCandidateDocument({
    candidateId: input.candidateId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    bytes: input.bytes,
    documentType: "RESUME",
    applicationId: input.applicationId,
    purpose: "RESUME",
    setAsPrimary: input.setAsPrimary,
  });
  if (result.ok) revalidateDocumentViews(input.candidateId);
  return result;
}

export async function linkExistingDocumentToApplication(input: {
  candidateId: string;
  applicationId: string;
  documentId: string;
}): Promise<{ ok: boolean; message: string; documentId?: string }> {
  const result = await linkDocumentToApplication({
    ...input,
    purpose: "RESUME",
  });
  if (!result.ok) return { ok: false, message: result.message };
  revalidateDocumentViews(input.candidateId);
  return {
    ok: true,
    message: "Document linked to application.",
    documentId: result.documentId,
  };
}
