import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { provisionCandidatePortalAccount } from "@/lib/candidate/provisioning";
import { isPubliclyOpen } from "@/lib/jobs/eligibility";
import type { EasyApplyPorts } from "@/lib/recruiting/easy-apply";
import {
  buildCandidateDocumentStoragePath,
  CANDIDATE_DOCUMENTS_BUCKET,
  uploadCandidateDocumentObject,
  validateCandidateDocumentFile,
} from "@/lib/storage/candidate-documents";

type DbError = { code?: string; message: string } | null;

function check(error: DbError, what: string): void {
  if (error) throw new Error(`${what} (${error.code ?? "no-code"}): ${error.message}`);
}

/** ilike treats % and _ as wildcards; match the email literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Supabase-backed persistence for the Easy Apply workflow. Every call checks its error. */
export function createSupabaseEasyApplyPorts(client: SupabaseClient): EasyApplyPorts {
  return {
    async isJobOpen(postingId) {
      const { data, error } = await client
        .from("jobs")
        .select("id,status,published_at,publish_at,expires_at,application_deadline")
        .eq("id", postingId)
        .maybeSingle();
      check(error, "job eligibility lookup failed");
      if (!data) return false;
      return isPubliclyOpen({
        status: data.status as string,
        publishedAt: (data.published_at as string) ?? null,
        publishAt: (data.publish_at as string) ?? null,
        expiresAt: (data.expires_at as string) ?? null,
        applicationDeadline: (data.application_deadline as string) ?? null,
      });
    },

    async findCandidateIdByEmail(email) {
      const { data, error } = await client
        .from("candidate_profiles")
        .select("id")
        .ilike("email", escapeLike(email))
        .order("created_at", { ascending: true })
        .limit(1);
      check(error, "candidate lookup failed");
      return (data?.[0]?.id as string | undefined) ?? null;
    },

    async hasActivatedAccount(candidateId) {
      const { data: candidate, error } = await client
        .from("candidate_profiles")
        .select("profile_id")
        .eq("id", candidateId)
        .maybeSingle();
      check(error, "candidate account lookup failed");
      const profileId = (candidate?.profile_id as string | null) ?? null;
      if (!profileId) return false;
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("status")
        .eq("id", profileId)
        .maybeSingle();
      check(profileError, "candidate account lookup failed");
      return profile?.status === "ACTIVE";
    },

    async findLibraryResume({ candidateId, documentId }) {
      const { data, error } = await client
        .from("documents")
        .select("id")
        .eq("id", documentId)
        .eq("candidate_id", candidateId)
        .eq("document_type", "RESUME")
        .eq("status", "ACTIVE")
        .maybeSingle();
      check(error, "library resume lookup failed");
      return Boolean(data);
    },

    async createCandidate({ id, data, now }) {
      const { error } = await client.from("candidate_profiles").insert({
        id,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email.trim(),
        phone: data.phone,
        linkedin_url: data.linkedinUrl,
        portfolio_url: data.portfolioUrl,
        work_authorization: data.workAuthorization,
        willing_to_relocate: data.willingToRelocate,
        source: data.source,
        created_at: now,
        updated_at: now,
      });
      check(error, "candidate insert failed");
    },

    async ensurePortalAccount(input) {
      if ((await provisionCandidatePortalAccount(input)) === "failed") throw new Error("portal invitation failed");
    },

    async findApplication(candidateId, requisitionId) {
      const { data, error } = await client
        .from("applications")
        .select("id, application_number")
        .eq("candidate_id", candidateId)
        .eq("requisition_id", requisitionId)
        .maybeSingle();
      check(error, "application lookup failed");
      return data
        ? { id: data.id as string, applicationNumber: data.application_number as string }
        : null;
    },

    async findResumeLink(applicationId) {
      const { data, error } = await client
        .from("application_documents")
        .select("document_id")
        .eq("application_id", applicationId)
        .eq("document_role", "RESUME")
        .limit(1);
      check(error, "resume link lookup failed");
      return (data?.[0]?.document_id as string | undefined) ?? null;
    },

    async uploadResumeObject({ candidateId, documentId, resume }) {
      const validation = validateCandidateDocumentFile({
        fileName: resume.fileName,
        mimeType: resume.mimeType,
        fileSize: resume.fileSize,
      });
      if (!validation.ok) throw new Error(`resume rejected: ${validation.error}`);
      const storagePath = buildCandidateDocumentStoragePath({
        candidateId,
        documentId,
        fileName: resume.fileName,
      });
      await uploadCandidateDocumentObject({
        storagePath,
        bytes: resume.bytes,
        mimeType: validation.mimeType,
      });
      return storagePath;
    },

    async removeResumeObject(storagePath) {
      const { error } = await client.storage.from(CANDIDATE_DOCUMENTS_BUCKET).remove([storagePath]);
      if (error) throw new Error(`resume object cleanup failed: ${error.message}`);
    },

    async insertResumeDocument({ documentId, candidateId, storagePath, resume, now }) {
      // Portal provisioning is best effort, so the profile link may not exist yet.
      const { data: candidate, error: profileError } = await client
        .from("candidate_profiles")
        .select("profile_id")
        .eq("id", candidateId)
        .maybeSingle();
      check(profileError, "candidate profile lookup failed");

      const validation = validateCandidateDocumentFile({
        fileName: resume.fileName,
        mimeType: resume.mimeType,
        fileSize: resume.fileSize,
      });
      const { error } = await client.from("documents").insert({
        id: documentId,
        candidate_id: candidateId,
        user_id: (candidate?.profile_id as string | null) ?? null,
        document_type: "RESUME",
        file_name: resume.fileName,
        storage_path: storagePath,
        mime_type: validation.ok ? validation.mimeType : resume.mimeType,
        file_size: resume.fileSize,
        uploaded_at: now,
        updated_at: now,
        // Promoted to primary only after the application link succeeds.
        is_primary_resume: false,
        status: "ACTIVE",
      });
      check(error, "document metadata insert failed");
    },

    async removeResumeDocument(documentId) {
      const { error } = await client.from("documents").delete().eq("id", documentId);
      check(error, "document metadata cleanup failed");
    },

    async createApplication({ id, applicationNumber, candidateId, data, now }) {
      const { error } = await client.from("applications").insert({
        id,
        application_number: applicationNumber,
        candidate_id: candidateId,
        requisition_id: data.requisitionId,
        job_id: data.postingId,
        status: "APPLIED",
        cover_letter: data.coverLetter,
        additional_information: data.additionalInformation,
        applied_at: now,
        updated_at: now,
      });
      check(error, "application insert failed");
    },

    async deleteApplication(applicationId) {
      const { error } = await client.from("applications").delete().eq("id", applicationId);
      check(error, "application compensation delete failed");
    },

    async linkResume({ applicationId, documentId, now }) {
      const { error } = await client.from("application_documents").insert({
        id: `appdoc-${crypto.randomUUID()}`,
        application_id: applicationId,
        document_id: documentId,
        purpose: "RESUME",
        document_role: "RESUME",
        attached_at: now,
        created_at: now,
      });
      check(error, "application/resume link insert failed");
    },

    async markPrimaryResume({ candidateId, documentId, now }) {
      const { error: demoteError } = await client
        .from("documents")
        .update({ is_primary_resume: false, updated_at: now })
        .eq("candidate_id", candidateId)
        .eq("document_type", "RESUME")
        .eq("is_primary_resume", true)
        .neq("id", documentId);
      check(demoteError, "primary resume demote failed");
      const { error } = await client
        .from("documents")
        .update({ is_primary_resume: true, updated_at: now })
        .eq("id", documentId);
      check(error, "primary resume promote failed");
    },

    async recordSubmission({ candidateId, applicationId, requisitionId, now }) {
      const { error: activityError } = await client.from("recruiting_activities").insert({
        id: `act-${crypto.randomUUID()}`,
        candidate_id: candidateId,
        application_id: applicationId,
        requisition_id: requisitionId,
        activity_type: "APPLICATION_SUBMITTED",
        summary: "Application submitted",
        created_at: now,
      });
      check(activityError, "recruiting activity insert failed");
      const { error: historyError } = await client.from("application_status_history").insert({
        id: `hist-${crypto.randomUUID()}`,
        application_id: applicationId,
        from_status: null,
        to_status: "APPLIED",
        note: "Application submitted",
        created_at: now,
      });
      check(historyError, "status history insert failed");
    },
  };
}
