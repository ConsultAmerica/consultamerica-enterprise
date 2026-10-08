/**
 * Detailed Apply drafts — pure domain rules (no I/O).
 *
 * A draft is private, unfinished work owned by one signed-in candidate. It is
 * never an application: it lives in application_drafts (db/schema/046), which
 * the recruiter ATS never reads. Final submission goes through the canonical
 * application service (lib/recruiting/actions.ts → submitEasyApplication);
 * the draft only records which application it became.
 *
 *   DRAFT ──submit──▶ SUBMITTING ──success──▶ SUBMITTED (application id)
 *     ▲                   │
 *     └──── failure ──────┘   (a stale SUBMITTING lease may be retried)
 */

import { z } from "zod";

import { detailedProfileSchema } from "@/lib/recruiting/detailed-profile";

export type DraftStatus = "DRAFT" | "SUBMITTING" | "SUBMITTED";

/** A SUBMITTING lease older than this is treated as an abandoned attempt. */
export const SUBMITTING_LEASE_MS = 5 * 60 * 1000;

/** Bumped when the payload shape changes; older payloads are migrated on read. */
export const DRAFT_PAYLOAD_VERSION = 1;

const text = (max: number) => z.string().trim().max(max);

export const draftContactSchema = z.object({
  firstName: text(80).default(""),
  lastName: text(80).default(""),
  phone: text(40).default(""),
  location: text(160).default(""),
  linkedinUrl: text(300).default(""),
  portfolioUrl: text(300).default(""),
});

export const draftAnswerSchema = z.object({ question: text(300), answer: text(2000) });

/** Everything the Detailed Apply form needs to restore a candidate's progress. */
export const draftPayloadSchema = z.object({
  contact: draftContactSchema.default(draftContactSchema.parse({})),
  profile: detailedProfileSchema.default(detailedProfileSchema.parse({})),
  answers: z.array(draftAnswerSchema).max(20).default([]),
  /** Last step the candidate was on (0-based), so "resume" lands in the right place. */
  step: z.number().int().min(0).max(10).default(0),
});

export type DraftPayload = z.infer<typeof draftPayloadSchema>;

/** Display-only copy of the job, so the drafts list renders even after a job closes. */
export type DraftJobSnapshot = { jobId: string; requisitionId: string; slug: string; title: string; company: string };

export type ApplicationDraft = {
  id: string;
  candidateId: string;
  job: DraftJobSnapshot;
  status: DraftStatus;
  resumeDocumentId: string | null;
  payload: DraftPayload;
  /** Optimistic-concurrency counter: every save must name the revision it edited. */
  revision: number;
  submittedApplicationId: string | null;
  submittingStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Parses untrusted payload JSON (client input or a stored row). Throws a ZodError when invalid. */
export function parseDraftPayload(raw: unknown): DraftPayload {
  return draftPayloadSchema.parse(raw ?? {});
}

export type SubmissionDecision =
  | { action: "submit" }
  | { action: "already-submitted"; applicationId: string }
  | { action: "in-progress" };

/** Whether a submit request may start an attempt now. */
export function decideDraftSubmission(draft: ApplicationDraft, now: Date = new Date()): SubmissionDecision {
  if (draft.status === "SUBMITTED" && draft.submittedApplicationId) {
    return { action: "already-submitted", applicationId: draft.submittedApplicationId };
  }
  if (draft.status === "SUBMITTING" && !isLeaseExpired(draft.submittingStartedAt, now)) {
    return { action: "in-progress" };
  }
  return { action: "submit" };
}

export function isLeaseExpired(startedAt: string | null, now: Date = new Date()): boolean {
  if (!startedAt) return true;
  const started = new Date(startedAt).getTime();
  return Number.isNaN(started) || now.getTime() - started >= SUBMITTING_LEASE_MS;
}

/** Only unfinished drafts can be edited or deleted; a submitted draft is history. */
export function isDraftEditable(draft: Pick<ApplicationDraft, "status" | "submittingStartedAt">, now: Date = new Date()): boolean {
  if (draft.status === "DRAFT") return true;
  return draft.status === "SUBMITTING" && isLeaseExpired(draft.submittingStartedAt, now);
}

/** Rough completeness for the drafts list — guidance only, never a gate. */
export function draftProgress(draft: Pick<ApplicationDraft, "payload" | "resumeDocumentId">): { done: number; total: number } {
  const { contact, profile } = draft.payload;
  const checks = [
    Boolean(contact.firstName && contact.lastName && contact.phone),
    Boolean(draft.resumeDocumentId),
    profile.experience.length > 0 || profile.education.length > 0 || profile.skills.length > 0,
  ];
  return { done: checks.filter(Boolean).length, total: checks.length };
}
