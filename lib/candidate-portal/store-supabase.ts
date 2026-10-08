import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DRAFT_PAYLOAD_VERSION,
  SUBMITTING_LEASE_MS,
  parseDraftPayload,
  type ApplicationDraft,
  type DraftJobSnapshot,
  type DraftStatus,
} from "@/lib/candidate-portal/drafts";
import type {
  CandidateApplication,
  CandidatePortalStore,
  CandidateProfile,
  LibraryResume,
  ResumeParseState,
  SavedJob,
} from "@/lib/candidate-portal/types";
import { deleteCandidateDocument, setPrimaryResume, uploadCandidateDocument } from "@/lib/documents";
import { isPubliclyOpen } from "@/lib/jobs/eligibility";
import { detailedProfileSchema } from "@/lib/recruiting/detailed-profile";
import type { ParsedResume } from "@/lib/recruiting/resume-parser";
import { createCandidateDocumentSignedUrl } from "@/lib/storage/candidate-documents";
import type { ApplicationStatus } from "@/types/recruiting";

/**
 * Supabase-backed candidate portal. Runs with the service role (RLS is
 * bypassed), so the ownership guard is explicit: EVERY query below filters on
 * the session candidate id passed in by the caller. The RLS policies in
 * db/schema/046 are defense in depth for any future anon-key access.
 */

type DbError = { code?: string; message: string } | null;

/** Table/column not deployed yet (migration pending) — degrade instead of failing the page. */
const isMissingRelation = (e: DbError) => e?.code === "PGRST205" || e?.code === "42P01";
const isMissingColumn = (e: DbError) => e?.code === "42703" || e?.code === "PGRST204";

function check(error: DbError, what: string): void {
  if (error) throw new Error(`${what} (${error.code ?? "no-code"}): ${error.message}`);
}

const PROFILE_BASE = "id, first_name, last_name, email, phone, linkedin_url, portfolio_url, work_authorization";
// 026 (shared database) adds these; fall back gracefully where it is not applied.
const PROFILE_EXTENDED = `${PROFILE_BASE}, city, state, professional_summary, github_url`;

function toProfile(row: Record<string, unknown>): CandidateProfile {
  const s = (key: string) => ((row[key] as string | null) ?? "").toString();
  return {
    candidateId: row.id as string,
    firstName: s("first_name"),
    lastName: s("last_name"),
    email: s("email"),
    phone: s("phone"),
    city: s("city"),
    state: s("state"),
    linkedinUrl: s("linkedin_url"),
    portfolioUrl: s("portfolio_url"),
    githubUrl: s("github_url"),
    professionalSummary: s("professional_summary"),
    workAuthorization: s("work_authorization"),
  };
}

function toDraft(row: Record<string, unknown>): ApplicationDraft {
  return {
    id: row.id as string,
    candidateId: row.candidate_id as string,
    job: row.job_snapshot as DraftJobSnapshot,
    status: row.status as DraftStatus,
    resumeDocumentId: (row.resume_document_id as string | null) ?? null,
    payload: parseDraftPayload(row.payload),
    revision: row.revision as number,
    submittedApplicationId: (row.submitted_application_id as string | null) ?? null,
    submittingStartedAt: (row.submitting_started_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

const nullIfEmpty = (v: string) => (v.trim() ? v.trim() : null);

export function createSupabaseCandidatePortalStore(client: SupabaseClient): CandidatePortalStore {
  async function jobsByIds(column: "id" | "requisition_id", ids: string[]) {
    if (ids.length === 0) return new Map<string, Record<string, unknown>>();
    const { data, error } = await client
      .from("jobs")
      // "*" on purpose: 044's company_name / application_type are not in every deployed schema.
      .select("*")
      .in(column, ids);
    check(error, "job lookup failed");
    return new Map((data ?? []).map((row) => [row[column] as string, row as Record<string, unknown>]));
  }

  async function ownedResume(candidateId: string, documentId: string) {
    const { data, error } = await client
      .from("documents")
      .select("id, storage_path, file_name, mime_type, status, document_type")
      .eq("id", documentId)
      .eq("candidate_id", candidateId)
      .eq("document_type", "RESUME")
      .neq("status", "DELETED")
      .maybeSingle();
    check(error, "resume lookup failed");
    return data;
  }

  const store: CandidatePortalStore = {
    async getProfile(candidateId) {
      let { data, error } = await client.from("candidate_profiles").select(PROFILE_EXTENDED).eq("id", candidateId).maybeSingle();
      if (isMissingColumn(error)) {
        ({ data, error } = await client.from("candidate_profiles").select(PROFILE_BASE).eq("id", candidateId).maybeSingle());
      }
      check(error, "candidate profile read failed");
      return data ? toProfile(data as Record<string, unknown>) : null;
    },

    async updateProfile(candidateId, u) {
      const base = {
        first_name: u.firstName.trim(),
        last_name: u.lastName.trim(),
        phone: nullIfEmpty(u.phone),
        linkedin_url: nullIfEmpty(u.linkedinUrl),
        portfolio_url: nullIfEmpty(u.portfolioUrl),
        work_authorization: nullIfEmpty(u.workAuthorization),
        updated_at: new Date().toISOString(),
      };
      const extended = {
        ...base,
        city: nullIfEmpty(u.city),
        state: nullIfEmpty(u.state),
        professional_summary: nullIfEmpty(u.professionalSummary),
        github_url: nullIfEmpty(u.githubUrl),
      };
      let { error } = await client.from("candidate_profiles").update(extended).eq("id", candidateId);
      if (isMissingColumn(error)) ({ error } = await client.from("candidate_profiles").update(base).eq("id", candidateId));
      check(error, "candidate profile update failed");
    },

    async listApplications(candidateId) {
      const { data, error } = await client
        .from("applications")
        .select("id, application_number, status, applied_at, updated_at, job_id, requisition_id")
        .eq("candidate_id", candidateId)
        .order("applied_at", { ascending: false });
      check(error, "application list failed");
      const apps = data ?? [];
      if (apps.length === 0) return [];

      const jobs = await jobsByIds("id", [...new Set(apps.map((a) => a.job_id as string).filter(Boolean))]);
      const { data: links, error: linkError } = await client
        .from("application_documents")
        .select("application_id, document_id")
        .in("application_id", apps.map((a) => a.id as string))
        .eq("document_role", "RESUME");
      check(linkError, "application resume links failed");
      const docIds = [...new Set((links ?? []).map((l) => l.document_id as string))];
      const { data: docs, error: docError } = docIds.length
        ? await client.from("documents").select("id, file_name").in("id", docIds).eq("candidate_id", candidateId)
        : { data: [], error: null };
      check(docError, "application resume lookup failed");
      const fileName = new Map((docs ?? []).map((d) => [d.id as string, d.file_name as string]));
      const resumeFor = new Map((links ?? []).map((l) => [l.application_id as string, l.document_id as string]));

      return apps.map((a): CandidateApplication => {
        const job = jobs.get(a.job_id as string);
        const docId = resumeFor.get(a.id as string);
        return {
          applicationId: a.id as string,
          applicationNumber: a.application_number as string,
          status: a.status as ApplicationStatus,
          appliedAt: a.applied_at as string,
          updatedAt: (a.updated_at as string | null) ?? null,
          job: {
            title: (job?.title as string) ?? "Position",
            slug: (job?.slug as string | null) ?? null,
            company: (job?.company_name as string | null) ?? null,
          },
          resume: docId ? { documentId: docId, fileName: fileName.get(docId) ?? "Résumé" } : null,
        };
      });
    },

    async listSavedJobs(candidateId) {
      const { data, error } = await client
        .from("candidate_saved_jobs")
        .select("job_requisition_id, created_at")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false });
      if (isMissingRelation(error)) return [];
      check(error, "saved jobs read failed");
      const rows = data ?? [];
      const jobs = await jobsByIds("requisition_id", rows.map((r) => r.job_requisition_id as string));
      return rows.map((r): SavedJob => {
        const job = jobs.get(r.job_requisition_id as string);
        return {
          requisitionId: r.job_requisition_id as string,
          savedAt: r.created_at as string,
          job: job
            ? {
                slug: job.slug as string,
                title: job.title as string,
                location: (job.location_name as string) ?? "",
                company: (job.company_name as string) ?? "Consult America",
                acceptingApplications: isPubliclyOpen({
                  status: job.status as string,
                  publishedAt: (job.published_at as string) ?? null,
                  publishAt: (job.publish_at as string) ?? null,
                  expiresAt: (job.expires_at as string) ?? null,
                  applicationDeadline: (job.application_deadline as string) ?? null,
                }),
              }
            : null,
        };
      });
    },

    async isJobSaved(candidateId, requisitionId) {
      const { data, error } = await client
        .from("candidate_saved_jobs")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("job_requisition_id", requisitionId)
        .maybeSingle();
      if (isMissingRelation(error)) return false;
      check(error, "saved job read failed");
      return Boolean(data);
    },

    async saveJob(candidateId, requisitionId) {
      const { error } = await client.from("candidate_saved_jobs").upsert(
        { id: `saved-${crypto.randomUUID()}`, candidate_id: candidateId, job_requisition_id: requisitionId },
        { onConflict: "candidate_id,job_requisition_id", ignoreDuplicates: true },
      );
      check(error, "save job failed");
    },

    async unsaveJob(candidateId, requisitionId) {
      const { error } = await client
        .from("candidate_saved_jobs")
        .delete()
        .eq("candidate_id", candidateId)
        .eq("job_requisition_id", requisitionId);
      check(error, "unsave job failed");
    },

    async listResumes(candidateId, options) {
      const { data, error } = await client
        .from("documents")
        .select("id, file_name, mime_type, file_size, uploaded_at, is_primary_resume, status")
        .eq("candidate_id", candidateId)
        .eq("document_type", "RESUME")
        .in("status", options?.includeArchived ? ["ACTIVE", "ARCHIVED"] : ["ACTIVE"])
        .order("uploaded_at", { ascending: false });
      check(error, "resume list failed");
      const docs = data ?? [];
      if (docs.length === 0) return [];
      const ids = docs.map((d) => d.id as string);

      const { data: links, error: linkError } = await client.from("application_documents").select("document_id").in("document_id", ids);
      check(linkError, "resume usage lookup failed");
      const usage = new Map<string, number>();
      for (const l of links ?? []) usage.set(l.document_id as string, (usage.get(l.document_id as string) ?? 0) + 1);

      const { data: parsed, error: parseError } = await client
        .from("resume_profiles")
        .select("document_id, status, parsed_at, parser_version")
        .eq("candidate_id", candidateId)
        .in("document_id", ids);
      if (!isMissingRelation(parseError)) check(parseError, "resume profile status lookup failed");
      const parseByDoc = new Map((parsed ?? []).map((p) => [p.document_id as string, p]));

      return docs.map((d): LibraryResume => {
        const p = parseByDoc.get(d.id as string);
        return {
          documentId: d.id as string,
          fileName: d.file_name as string,
          mimeType: (d.mime_type as string | null) ?? null,
          fileSize: (d.file_size as number | null) ?? null,
          uploadedAt: d.uploaded_at as string,
          isDefault: Boolean(d.is_primary_resume) && d.status === "ACTIVE",
          status: d.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
          applicationCount: usage.get(d.id as string) ?? 0,
          parse: p
            ? { state: p.status as ResumeParseState, parsedAt: p.parsed_at as string, parserVersion: p.parser_version as string }
            : { state: "PENDING", parsedAt: null, parserVersion: null },
        };
      });
    },

    async uploadResume(candidateId, file, options) {
      const { data: current, error } = await client
        .from("documents")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("document_type", "RESUME")
        .eq("status", "ACTIVE")
        .eq("is_primary_resume", true)
        .limit(1);
      check(error, "default resume lookup failed");
      const result = await uploadCandidateDocument({
        candidateId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        bytes: file.bytes,
        documentType: "RESUME",
        setAsPrimary: options.makeDefault || (current ?? []).length === 0,
      });
      if (!result.ok) throw new Error(`resume upload failed: ${result.message}`);
      return { documentId: result.documentId };
    },

    async setDefaultResume(candidateId, documentId) {
      const result = await setPrimaryResume({ candidateId, documentId });
      return result.ok;
    },

    async removeResume(candidateId, documentId) {
      const result = await deleteCandidateDocument({ candidateId, documentId });
      if (!result.ok) return { removed: false, preservedForApplications: false };
      return { removed: true, preservedForApplications: result.preservedForApplications };
    },

    async resumeDownload(candidateId, documentId) {
      const doc = await ownedResume(candidateId, documentId);
      if (!doc?.storage_path) return null;
      const url = await createCandidateDocumentSignedUrl(doc.storage_path as string, 60);
      return { kind: "redirect", url };
    },

    async getResumeProfile(candidateId, documentId) {
      if (!(await ownedResume(candidateId, documentId))) return null;
      let { data, error } = await client
        .from("resume_profiles")
        .select("status, parser_version, structured, candidate_reviewed, candidate_reviewed_at")
        .eq("document_id", documentId)
        .eq("candidate_id", candidateId)
        .maybeSingle();
      if (isMissingColumn(error)) {
        ({ data, error } = await client
          .from("resume_profiles")
          .select("status, parser_version, structured")
          .eq("document_id", documentId)
          .eq("candidate_id", candidateId)
          .maybeSingle());
      }
      if (isMissingRelation(error)) data = null;
      else check(error, "resume profile read failed");
      const row = (data ?? null) as Record<string, unknown> | null;
      const reviewed = row?.candidate_reviewed ? detailedProfileSchema.safeParse(row.candidate_reviewed) : null;
      return {
        documentId,
        state: ((row?.status as ResumeParseState) ?? "PENDING"),
        parserVersion: (row?.parser_version as string | null) ?? null,
        parsed: row?.status === "PARSED" ? ((row.structured as ParsedResume | null) ?? null) : null,
        reviewed: reviewed?.success ? reviewed.data : null,
        reviewedAt: (row?.candidate_reviewed_at as string | null) ?? null,
      };
    },

    async saveResumeReview(candidateId, documentId, profile) {
      if (!(await ownedResume(candidateId, documentId))) return false;
      const now = new Date().toISOString();
      const { data, error } = await client
        .from("resume_profiles")
        .update({ candidate_reviewed: profile, candidate_reviewed_at: now, updated_at: now })
        .eq("document_id", documentId)
        .eq("candidate_id", candidateId)
        .select("id");
      check(error, "resume review save failed");
      return (data ?? []).length > 0;
    },

    async listDrafts(candidateId) {
      const { data, error } = await client
        .from("application_drafts")
        .select("*")
        .eq("candidate_id", candidateId)
        .in("status", ["DRAFT", "SUBMITTING"])
        .order("updated_at", { ascending: false });
      if (isMissingRelation(error)) return [];
      check(error, "draft list failed");
      return (data ?? []).map(toDraft);
    },

    async getDraft(candidateId, draftId) {
      const { data, error } = await client
        .from("application_drafts")
        .select("*")
        .eq("id", draftId)
        .eq("candidate_id", candidateId)
        .maybeSingle();
      if (isMissingRelation(error)) return null;
      check(error, "draft read failed");
      return data ? toDraft(data) : null;
    },

    async findOpenDraft(candidateId, requisitionId) {
      const { data, error } = await client
        .from("application_drafts")
        .select("*")
        .eq("candidate_id", candidateId)
        .eq("requisition_id", requisitionId)
        .in("status", ["DRAFT", "SUBMITTING"])
        .maybeSingle();
      if (isMissingRelation(error)) return null;
      check(error, "open draft lookup failed");
      return data ? toDraft(data) : null;
    },

    async createDraft(candidateId, job, write) {
      const now = new Date().toISOString();
      const { data, error } = await client
        .from("application_drafts")
        .insert({
          id: `draft-${crypto.randomUUID()}`,
          candidate_id: candidateId,
          job_id: job.jobId,
          requisition_id: job.requisitionId,
          job_snapshot: job,
          status: "DRAFT",
          resume_document_id: write.resumeDocumentId,
          payload: write.payload,
          payload_version: DRAFT_PAYLOAD_VERSION,
          revision: 1,
          created_at: now,
          updated_at: now,
        })
        .select("*")
        .single();
      if (error?.code === "23505") {
        // One open draft per candidate and job (uq_application_drafts_open): reuse it.
        const existing = await store.findOpenDraft(candidateId, job.requisitionId);
        if (existing) return existing;
      }
      check(error, "draft create failed");
      return toDraft(data);
    },

    async updateDraft(candidateId, draftId, expectedRevision, write) {
      const { data, error } = await client
        .from("application_drafts")
        .update({
          payload: write.payload,
          payload_version: DRAFT_PAYLOAD_VERSION,
          resume_document_id: write.resumeDocumentId,
          revision: expectedRevision + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftId)
        .eq("candidate_id", candidateId)
        .eq("status", "DRAFT")
        .eq("revision", expectedRevision)
        .select("*");
      check(error, "draft update failed");
      if (data && data.length > 0) return toDraft(data[0]);
      const current = await store.getDraft(candidateId, draftId);
      if (!current || current.status !== "DRAFT") return null;
      return "conflict";
    },

    async deleteDraft(candidateId, draftId) {
      const { data, error } = await client
        .from("application_drafts")
        .delete()
        .eq("id", draftId)
        .eq("candidate_id", candidateId)
        .eq("status", "DRAFT")
        .select("id");
      check(error, "draft delete failed");
      return (data ?? []).length > 0;
    },

    async beginDraftSubmission(candidateId, draftId, now) {
      const staleBefore = new Date(now.getTime() - SUBMITTING_LEASE_MS).toISOString();
      const { data, error } = await client
        .from("application_drafts")
        .update({ status: "SUBMITTING", submitting_started_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", draftId)
        .eq("candidate_id", candidateId)
        .or(`status.eq.DRAFT,and(status.eq.SUBMITTING,submitting_started_at.lt.${staleBefore})`)
        .select("id");
      check(error, "draft submission lease failed");
      return (data ?? []).length > 0;
    },

    async completeDraftSubmission(candidateId, draftId, applicationId) {
      const now = new Date().toISOString();
      const { error } = await client
        .from("application_drafts")
        .update({ status: "SUBMITTED", submitted_application_id: applicationId, submitted_at: now, updated_at: now })
        .eq("id", draftId)
        .eq("candidate_id", candidateId);
      check(error, "draft completion failed");
    },

    async abortDraftSubmission(candidateId, draftId) {
      const { error } = await client
        .from("application_drafts")
        .update({ status: "DRAFT", submitting_started_at: null, updated_at: new Date().toISOString() })
        .eq("id", draftId)
        .eq("candidate_id", candidateId)
        .eq("status", "SUBMITTING");
      check(error, "draft submission release failed");
    },

    async openDraftsUsingResume(candidateId, documentId) {
      const { count, error } = await client
        .from("application_drafts")
        .select("id", { count: "exact", head: true })
        .eq("candidate_id", candidateId)
        .eq("resume_document_id", documentId)
        .in("status", ["DRAFT", "SUBMITTING"]);
      if (isMissingRelation(error)) return 0;
      check(error, "draft resume usage lookup failed");
      return count ?? 0;
    },
  };
  return store;
}
