import { getSupabaseServiceClient, isSupabaseConfigured } from "@/app/lib/supabase/server";
import type { DocumentType } from "@/types/recruiting";

export const CANDIDATE_DOCUMENTS_BUCKET = "candidate-documents";
export const MAX_CANDIDATE_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const ALLOWED_CANDIDATE_DOCUMENT_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const EXT_BY_MIME: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
};

export function sanitizeDocumentFileName(name: string): string {
  return name
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 160);
}

function inferMimeFromFileName(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

export function resolveCandidateDocumentMimeType(
  fileName: string,
  mimeType: string,
): string | null {
  if (ALLOWED_CANDIDATE_DOCUMENT_MIME.has(mimeType)) return mimeType;
  if (
    !mimeType ||
    mimeType === "application/octet-stream" ||
    mimeType === "binary/octet-stream"
  ) {
    return inferMimeFromFileName(fileName);
  }
  return null;
}

export function validateCandidateDocumentFile(input: {
  fileName: string;
  mimeType: string;
  fileSize: number;
}): { ok: true; mimeType: string } | { ok: false; error: string } {
  if (input.fileSize <= 0) {
    return { ok: false, error: "The selected file is empty." };
  }
  if (input.fileSize > MAX_CANDIDATE_DOCUMENT_BYTES) {
    return { ok: false, error: "File is larger than 10MB. Choose a smaller file." };
  }
  const mimeType = resolveCandidateDocumentMimeType(
    input.fileName,
    input.mimeType,
  );
  if (!mimeType) {
    return {
      ok: false,
      error: "Only PDF, DOC, and DOCX files are accepted.",
    };
  }
  const lower = input.fileName.toLowerCase();
  const allowedExt = EXT_BY_MIME[mimeType] ?? [];
  if (!allowedExt.some((ext) => lower.endsWith(ext))) {
    return {
      ok: false,
      error: "File extension does not match the file type.",
    };
  }
  return { ok: true, mimeType };
}

/**
 * Storage path convention for private bucket:
 * `{candidate_id}/{document_id}/{sanitized_filename}`
 *
 * profileId is accepted for callers that already resolved ownership; path
 * uses candidate_id as the source-of-truth folder (service-role uploads).
 */
export function buildCandidateDocumentStoragePath(input: {
  candidateId: string;
  documentId: string;
  fileName: string;
  /** @deprecated Prefer candidateId; kept for call-site compatibility. */
  profileId?: string;
}): string {
  const safe = sanitizeDocumentFileName(input.fileName) || "document";
  return `${input.candidateId}/${input.documentId}/${safe}`;
}

export async function uploadCandidateDocumentObject(input: {
  storagePath: string;
  bytes: ArrayBuffer | Buffer | Uint8Array;
  mimeType: string;
}): Promise<void> {
  const client = getSupabaseServiceClient();
  if (!client) throw new Error("Supabase is not configured");

  const body =
    input.bytes instanceof Buffer
      ? input.bytes
      : Buffer.from(input.bytes as ArrayBuffer);

  const { error } = await client.storage
    .from(CANDIDATE_DOCUMENTS_BUCKET)
    .upload(input.storagePath, body, {
      contentType: input.mimeType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}

export async function createCandidateDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 120,
): Promise<string> {
  const client = getSupabaseServiceClient();
  if (!client) throw new Error("Supabase is not configured");

  const { data, error } = await client.storage
    .from(CANDIDATE_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Unable to create signed URL");
  }
  return data.signedUrl;
}

export async function removeCandidateDocumentObject(
  storagePath: string,
): Promise<void> {
  const client = getSupabaseServiceClient();
  if (!client) return;

  await client.storage.from(CANDIDATE_DOCUMENTS_BUCKET).remove([storagePath]);
}

export function isCandidateDocumentsStorageReady(): boolean {
  return isSupabaseConfigured();
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  RESUME: "Resume",
  COVER_LETTER: "Cover Letter",
  PORTFOLIO: "Portfolio",
  TRANSCRIPT: "Transcript",
  CERTIFICATION: "Certification",
  OTHER: "Other",
};
