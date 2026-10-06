/**
 * Single source of truth for candidate document metadata + private storage.
 *
 * Canonical table: `documents` (renamed from candidate_documents in 011).
 * Application links: `application_documents` (no file copies).
 * Bucket: private `candidate-documents`.
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "@/app/lib/supabase/server";
import {
  buildCandidateDocumentStoragePath,
  createCandidateDocumentSignedUrl,
  removeCandidateDocumentObject,
  uploadCandidateDocumentObject,
  validateCandidateDocumentFile,
} from "@/lib/storage/candidate-documents";
import { decideApplicationDocumentLink } from "@/lib/documents/application-document-lineage";
import type { ApplicationDocument, Document, DocumentType } from "@/types/recruiting";

export type DocumentPurpose =
  | "RESUME"
  | "COVER_LETTER"
  | "SUPPORTING"
  | "OTHER"
  | "PORTFOLIO";

/** Spec alias for purpose / document_role. */
export type DocumentRole = DocumentPurpose;

export type CandidateDocumentRow = Document & {
  uploadedByUserId?: string;
  archivedAt?: string;
};

export type ApplicationDocumentLink = ApplicationDocument & {
  purpose?: DocumentPurpose;
  documentRole?: DocumentRole;
  attachedAt?: string;
  document?: CandidateDocumentRow;
  requisitionTitle?: string;
};

function mapRow(row: Record<string, unknown>): CandidateDocumentRow {
  return {
    id: row.id as string,
    candidateId: row.candidate_id as string,
    userId: (row.user_id as string) ?? undefined,
    uploadedByUserId: (row.user_id as string) ?? undefined,
    documentType: row.document_type as DocumentType,
    fileName: row.file_name as string,
    storagePath: row.storage_path as string,
    mimeType: (row.mime_type as string) ?? undefined,
    fileSize: (row.file_size as number) ?? undefined,
    uploadedAt: row.uploaded_at as string,
    updatedAt: (row.updated_at as string) ?? undefined,
    isPrimaryResume: Boolean(row.is_primary_resume),
    status: (row.status as Document["status"]) ?? "ACTIVE",
    archivedAt: (row.archived_at as string) ?? undefined,
  };
}

async function resolveProfileId(candidateId: string): Promise<string> {
  const client = getSupabaseServiceClient();
  if (!client) throw new Error("Supabase is not configured");

  const { data, error } = await client
    .from("candidate_profiles")
    .select("profile_id")
    .eq("id", candidateId)
    .maybeSingle();

  if (error || !data?.profile_id) {
    throw new Error(
      "Candidate profile link is missing. Sign out and sign in again.",
    );
  }
  return data.profile_id as string;
}

async function clearPrimaryResumeFlags(candidateId: string, exceptId?: string) {
  const client = getSupabaseServiceClient();
  if (!client) return;

  let query = client
    .from("documents")
    .update({ is_primary_resume: false, updated_at: new Date().toISOString() })
    .eq("candidate_id", candidateId)
    .eq("document_type", "RESUME")
    .eq("is_primary_resume", true);

  if (exceptId) query = query.neq("id", exceptId);
  await query;
}

export async function getCandidateDocuments(
  candidateId: string,
  options?: { includeArchived?: boolean },
): Promise<CandidateDocumentRow[]> {
  const client = getSupabaseServiceClient();
  if (!client) return [];

  let query = client
    .from("documents")
    .select("*")
    .eq("candidate_id", candidateId)
    .order("uploaded_at", { ascending: false });

  if (options?.includeArchived) {
    query = query.in("status", ["ACTIVE", "ARCHIVED"]);
  } else {
    query = query.eq("status", "ACTIVE");
  }

  const { data } = await query;
  return (data ?? []).map(mapRow);
}

export async function getPrimaryResume(
  candidateId: string,
): Promise<CandidateDocumentRow | null> {
  const docs = await getCandidateDocuments(candidateId);
  return (
    docs.find((d) => d.documentType === "RESUME" && d.isPrimaryResume) ??
    docs.find((d) => d.documentType === "RESUME") ??
    null
  );
}

export async function getApplicationDocumentLinks(
  applicationIds: string[],
): Promise<ApplicationDocumentLink[]> {
  const client = getSupabaseServiceClient();
  if (!client || applicationIds.length === 0) return [];

  const { data: links } = await client
    .from("application_documents")
    .select("*")
    .in("application_id", applicationIds)
    .order("created_at", { ascending: false });

  if (!links?.length) return [];

  const documentIds = [...new Set(links.map((l) => l.document_id as string))];
  const { data: docs } = await client
    .from("documents")
    .select("*")
    .in("id", documentIds);

  const docById = new Map((docs ?? []).map((row) => [row.id as string, mapRow(row)]));

  return links.map((link) => ({
    id: link.id as string,
    applicationId: link.application_id as string,
    documentId: link.document_id as string,
    purpose: (link.document_role as DocumentPurpose | undefined) ??
      (link.purpose as DocumentPurpose | undefined) ??
      undefined,
    documentRole: (link.document_role as DocumentRole | undefined) ??
      (link.purpose as DocumentRole | undefined) ??
      undefined,
    createdAt: (link.attached_at as string) ?? (link.created_at as string),
    attachedAt: (link.attached_at as string) ?? (link.created_at as string),
    document: docById.get(link.document_id as string),
  }));
}

/** Phase-5 API: documents linked to one application (immutable after submit). */
export async function getApplicationDocuments(
  applicationId: string,
): Promise<ApplicationDocumentLink[]> {
  return getApplicationDocumentLinks([applicationId]);
}

export async function linkDocumentToApplication(input: {
  candidateId: string;
  applicationId: string;
  documentId: string;
  purpose?: DocumentPurpose;
  documentRole?: DocumentRole;
}): Promise<{ ok: true; documentId: string } | { ok: false; message: string }> {
  const client = getSupabaseServiceClient();
  if (!client) {
    return {
      ok: false,
      message: "Document linking requires the connected environment.",
    };
  }

  const { data: existing } = await client
    .from("documents")
    .select("*")
    .eq("id", input.documentId)
    .maybeSingle();

  if (!existing || existing.status === "DELETED") {
    return { ok: false, message: "Document not found." };
  }
  if ((existing.candidate_id as string) !== input.candidateId) {
    return { ok: false, message: "Forbidden." };
  }

  const documentRole =
    input.documentRole ??
    input.purpose ??
    ((existing.document_type as string) === "RESUME"
      ? "RESUME"
      : existing.document_type === "COVER_LETTER"
        ? "COVER_LETTER"
        : "SUPPORTING");

  const { data: existingLinks } = await client
    .from("application_documents")
    .select("document_id")
    .eq("application_id", input.applicationId)
    .eq("document_role", documentRole);

  const decision = decideApplicationDocumentLink({
    existingDocumentId: (existingLinks?.[0]?.document_id as string) ?? null,
    requestedDocumentId: input.documentId,
  });
  if (decision.action === "keep") {
    return { ok: true, documentId: decision.documentId };
  }
  if (decision.action === "reject") {
    return { ok: false, message: decision.reason };
  }

  const now = new Date().toISOString();
  const { error } = await client.from("application_documents").insert({
    id: `appdoc-${crypto.randomUUID()}`,
      application_id: input.applicationId,
      document_id: input.documentId,
      purpose: documentRole,
      document_role: documentRole,
      attached_at: now,
      created_at: now,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, documentId: input.documentId };
}

export async function uploadCandidateDocument(input: {
  candidateId: string;
  profileId?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  bytes: ArrayBuffer | Buffer | Uint8Array;
  documentType: DocumentType;
  applicationId?: string;
  purpose?: DocumentPurpose;
  /** When true (default for RESUME), becomes the only primary resume. */
  setAsPrimary?: boolean;
  uploadedByUserId?: string;
}): Promise<{ ok: true; documentId: string } | { ok: false; message: string }> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message: "Document uploads require the connected candidate environment.",
    };
  }

  const validation = validateCandidateDocumentFile({
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
  });
  if (!validation.ok) return { ok: false, message: validation.error };

  const client = getSupabaseServiceClient();
  if (!client) {
    return {
      ok: false,
      message: "Document uploads require the connected candidate environment.",
    };
  }

  const profileId = input.profileId ?? (await resolveProfileId(input.candidateId));
  const now = new Date().toISOString();
  const documentId = `doc-${crypto.randomUUID()}`;
  const storagePath = buildCandidateDocumentStoragePath({
    candidateId: input.candidateId,
    profileId,
    documentId,
    fileName: input.fileName,
  });

  await uploadCandidateDocumentObject({
    storagePath,
    bytes: input.bytes,
    mimeType: validation.mimeType,
  });

  const isResume = input.documentType === "RESUME";
  const setAsPrimary = input.setAsPrimary ?? isResume;
  if (isResume && setAsPrimary) {
    await clearPrimaryResumeFlags(input.candidateId);
  }

  const { error: insertError } = await client.from("documents").insert({
    id: documentId,
    candidate_id: input.candidateId,
    user_id: input.uploadedByUserId ?? profileId,
    document_type: input.documentType,
    file_name: input.fileName,
    storage_path: storagePath,
    mime_type: validation.mimeType,
    file_size: input.fileSize,
    uploaded_at: now,
    updated_at: now,
    is_primary_resume: Boolean(isResume && setAsPrimary),
    status: "ACTIVE",
  });

  if (insertError) {
    await removeCandidateDocumentObject(storagePath);
    return { ok: false, message: insertError.message };
  }

  if (input.applicationId) {
    await linkDocumentToApplication({
      candidateId: input.candidateId,
      applicationId: input.applicationId,
      documentId,
      purpose: input.purpose ?? (isResume ? "RESUME" : "SUPPORTING"),
    });
  }

  return { ok: true, documentId };
}

/**
 * Replace primary resume without mutating the prior document row.
 * Prior resume is demoted + archived so application_documents links remain valid.
 */
export async function replacePrimaryResume(input: {
  candidateId: string;
  profileId?: string;
  previousDocumentId?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  bytes: ArrayBuffer | Buffer | Uint8Array;
  uploadedByUserId?: string;
}): Promise<{ ok: true; documentId: string } | { ok: false; message: string }> {
  const client = getSupabaseServiceClient();
  if (!client) {
    return {
      ok: false,
      message: "Document uploads require the connected candidate environment.",
    };
  }

  const active = await getCandidateDocuments(input.candidateId);
  const previousId =
    input.previousDocumentId ??
    active.find((d) => d.documentType === "RESUME" && d.isPrimaryResume)?.id ??
    active.find((d) => d.documentType === "RESUME")?.id;

  if (previousId) {
    const { data: existing } = await client
      .from("documents")
      .select("candidate_id")
      .eq("id", previousId)
      .maybeSingle();
    if (!existing) return { ok: false, message: "Document not found." };
    if ((existing.candidate_id as string) !== input.candidateId) {
      return { ok: false, message: "Forbidden." };
    }
  }

  const created = await uploadCandidateDocument({
    candidateId: input.candidateId,
    profileId: input.profileId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    bytes: input.bytes,
    documentType: "RESUME",
    setAsPrimary: true,
    uploadedByUserId: input.uploadedByUserId,
  });

  if (!created.ok) return created;

  if (previousId && previousId !== created.documentId) {
    await client
      .from("documents")
      .update({
        is_primary_resume: false,
        status: "ARCHIVED",
        archived_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", previousId);
  }

  return created;
}

/** Archive without removing storage object or application_documents links. */
export async function archiveCandidateDocument(input: {
  candidateId: string;
  documentId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = getSupabaseServiceClient();
  if (!client) {
    return {
      ok: false,
      message: "Document uploads require the connected candidate environment.",
    };
  }

  const { data: existing } = await client
    .from("documents")
    .select("candidate_id")
    .eq("id", input.documentId)
    .maybeSingle();

  if (!existing) return { ok: false, message: "Document not found." };
  if ((existing.candidate_id as string) !== input.candidateId) {
    return { ok: false, message: "Forbidden." };
  }

  const now = new Date().toISOString();
  const { error } = await client
    .from("documents")
    .update({
      status: "ARCHIVED",
      is_primary_resume: false,
      archived_at: now,
      updated_at: now,
    })
    .eq("id", input.documentId);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function deleteCandidateDocument(input: {
  candidateId: string;
  documentId: string;
}): Promise<
  | { ok: true; preservedForApplications: boolean }
  | { ok: false; message: string }
> {
  const client = getSupabaseServiceClient();
  if (!client) {
    return {
      ok: false,
      message: "Document uploads require the connected candidate environment.",
    };
  }

  const { data: existing } = await client
    .from("documents")
    .select("*")
    .eq("id", input.documentId)
    .maybeSingle();

  if (!existing) return { ok: false, message: "Document not found." };
  if ((existing.candidate_id as string) !== input.candidateId) {
    return { ok: false, message: "Forbidden." };
  }

  const { data: links } = await client
    .from("application_documents")
    .select("id")
    .eq("document_id", input.documentId)
    .limit(1);

  const linked = (links?.length ?? 0) > 0;

  if (linked) {
    const archived = await archiveCandidateDocument(input);
    if (!archived.ok) return archived;
    return { ok: true, preservedForApplications: true };
  }

  const now = new Date().toISOString();
  await client
    .from("documents")
    .update({
      status: "DELETED",
      is_primary_resume: false,
      archived_at: now,
      updated_at: now,
    })
    .eq("id", input.documentId);

  if (existing.storage_path) {
    await removeCandidateDocumentObject(existing.storage_path as string);
  }
  return { ok: true, preservedForApplications: false };
}

export async function getSignedDocumentUrl(
  documentId: string,
  expiresInSeconds = 180,
): Promise<{ ok: true; signedUrl: string } | { ok: false; message: string }> {
  const client = getSupabaseServiceClient();
  if (!client) {
    return {
      ok: false,
      message: "Document access requires the connected environment.",
    };
  }

  const { data: existing } = await client
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (!existing || existing.status === "DELETED") {
    return { ok: false, message: "Document not found." };
  }

  try {
    const signedUrl = await createCandidateDocumentSignedUrl(
      existing.storage_path as string,
      expiresInSeconds,
    );
    return { ok: true, signedUrl };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to open document.",
    };
  }
}

export function isCandidateDocumentsReady() {
  return isSupabaseConfigured();
}
