/**
 * Match persistence + recalculation design (PREPARED, NOT WIRED).
 *
 * Today matching (lib/recruiting/matching.ts) is computed on demand and
 * nothing is stored. This module defines how results will be persisted
 * (db/schema/047, unapplied) without changing that behavior:
 *
 *   resume_profiles ─┐                       ┌─ job_analyses (versioned requirements)
 *   (parser_version, ├─ resume fingerprint   │  job fingerprint
 *    structured,     │                       │
 *    candidate_      └──────► match_results ◄┘  + matcher version
 *    reviewed)                (score, band, evidence findings, not-found indicators)
 *
 * A stored result is CURRENT only while all three inputs match what produced
 * it; any change makes it stale, detected on read by comparing fingerprints
 * (no trigger required) and queued for recomputation by the change points.
 *
 * Results are advisory decision support. Nothing here — or anything that
 * consumes it — may change application status, reject, advance or rank
 * candidates out of human review. "Not found" means the résumé does not
 * mention a requirement, never that the candidate lacks it.
 */

import { createHash } from "node:crypto";

import type { JobAnalysis, JobRequirementSource, JobRequirements } from "@/lib/recruiting/job-analyzer";
import type { DetailedProfile } from "@/lib/recruiting/detailed-profile";
import type { ParsedResume } from "@/lib/recruiting/resume-parser";

/** Bump when analyzeCandidateForJob's scoring or evidence rules change. */
export const MATCHER_VERSION = "job-analyzer/1";
/** Bump when requirementsFromJob's extraction rules change. */
export const JOB_ANALYZER_VERSION = "job-requirements/1";

/** Deterministic JSON: object keys sorted, so equal content always hashes equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Identity of the résumé evidence a match was computed from. */
export function resumeFingerprint(input: {
  documentId: string;
  parserVersion: string;
  structured: ParsedResume | null;
  candidateReviewed?: DetailedProfile | null;
}): string {
  return sha256(
    stableStringify({
      d: input.documentId,
      p: input.parserVersion,
      s: input.structured,
      r: input.candidateReviewed ?? null,
    }),
  );
}

/** Identity of the job text requirements were extracted from (whitespace-insensitive). */
export function jobFingerprint(source: JobRequirementSource): string {
  const norm = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
  const list = (v: string[] | undefined) => (v ?? []).map(norm).filter(Boolean);
  return sha256(
    stableStringify({
      v: JOB_ANALYZER_VERSION,
      t: norm(source.title),
      d: norm(source.description),
      r: list(source.responsibilities),
      q: list(source.qualifications),
      p: list(source.preferredQualifications),
      k: [...list(source.skills)].sort(),
    }),
  );
}

export type StoredJobAnalysis = {
  id: string;
  requisitionId: string;
  analyzerVersion: string;
  sourceFingerprint: string;
  requirements: JobRequirements;
  createdAt: string;
};

export type MatchStatus = "CURRENT" | "STALE";

export type StoredMatchResult = {
  id: string;
  candidateId: string;
  resumeProfileId: string;
  requisitionId: string;
  jobAnalysisId: string;
  matcherVersion: string;
  resumeFingerprint: string;
  jobFingerprint: string;
  score: number | null;
  band: JobAnalysis["band"];
  /** Full explainable analysis: findings with evidence quotes, not-found and unknown lists. */
  analysis: JobAnalysis;
  status: MatchStatus;
  computedAt: string;
  staleSince: string | null;
};

export type Freshness =
  | { fresh: true }
  | { fresh: false; reasons: Array<"RESUME_CHANGED" | "JOB_CHANGED" | "MATCHER_UPGRADED" | "MARKED_STALE"> };

/** Read-time staleness: a stored result is only shown as current if every input still matches. */
export function matchFreshness(
  stored: Pick<StoredMatchResult, "resumeFingerprint" | "jobFingerprint" | "matcherVersion" | "status">,
  current: { resumeFingerprint: string; jobFingerprint: string; matcherVersion?: string },
): Freshness {
  const reasons: Array<"RESUME_CHANGED" | "JOB_CHANGED" | "MATCHER_UPGRADED" | "MARKED_STALE"> = [];
  if (stored.resumeFingerprint !== current.resumeFingerprint) reasons.push("RESUME_CHANGED");
  if (stored.jobFingerprint !== current.jobFingerprint) reasons.push("JOB_CHANGED");
  if (stored.matcherVersion !== (current.matcherVersion ?? MATCHER_VERSION)) reasons.push("MATCHER_UPGRADED");
  if (stored.status === "STALE") reasons.push("MARKED_STALE");
  return reasons.length === 0 ? { fresh: true } : { fresh: false, reasons };
}

/**
 * Builds the row to persist. Deliberately carries no application id or
 * status: a match describes résumé ↔ requirements evidence, not a decision.
 */
export function toStoredMatch(input: {
  id: string;
  candidateId: string;
  resumeProfileId: string;
  requisitionId: string;
  jobAnalysisId: string;
  resumeFingerprint: string;
  jobFingerprint: string;
  analysis: JobAnalysis;
  computedAt: string;
}): StoredMatchResult {
  return {
    ...input,
    matcherVersion: MATCHER_VERSION,
    score: input.analysis.score,
    band: input.analysis.band,
    status: "CURRENT",
    staleSince: null,
  };
}

export type RecalculationEvent =
  | { type: "RESUME_PARSED" | "RESUME_REVIEWED"; candidateId: string; resumeProfileId: string }
  | { type: "REQUISITION_UPDATED"; requisitionId: string }
  | { type: "JOB_PUBLICATION_CHANGED"; requisitionId: string; open: boolean }
  | { type: "MATCHER_UPGRADED" };

export type RecalculationTask =
  | { subjectType: "RESUME_PROFILE"; subjectId: string; reason: RecalculationEvent["type"] }
  | { subjectType: "REQUISITION"; subjectId: string; reason: RecalculationEvent["type"] }
  | { subjectType: "ALL"; subjectId: "*"; reason: "MATCHER_UPGRADED" };

export type RecalculationPlan = {
  /** Mark these stored results STALE immediately (cheap, synchronous with the change). */
  markStale: Array<{ by: "resumeProfileId" | "requisitionId" | "all"; id: string }>;
  /** Queue recomputation (worker, rate-limited); deduplicated per subject. */
  enqueue: RecalculationTask[];
};

/**
 * What a source change invalidates. Closing a job stales its results but
 * queues nothing (closed jobs are never recommended); reopening recomputes.
 */
export function planRecalculation(event: RecalculationEvent): RecalculationPlan {
  switch (event.type) {
    case "RESUME_PARSED":
    case "RESUME_REVIEWED":
      return {
        markStale: [{ by: "resumeProfileId", id: event.resumeProfileId }],
        enqueue: [{ subjectType: "RESUME_PROFILE", subjectId: event.resumeProfileId, reason: event.type }],
      };
    case "REQUISITION_UPDATED":
      return {
        markStale: [{ by: "requisitionId", id: event.requisitionId }],
        enqueue: [{ subjectType: "REQUISITION", subjectId: event.requisitionId, reason: event.type }],
      };
    case "JOB_PUBLICATION_CHANGED":
      return {
        markStale: [{ by: "requisitionId", id: event.requisitionId }],
        enqueue: event.open ? [{ subjectType: "REQUISITION", subjectId: event.requisitionId, reason: event.type }] : [],
      };
    case "MATCHER_UPGRADED":
      return { markStale: [{ by: "all", id: "*" }], enqueue: [{ subjectType: "ALL", subjectId: "*", reason: "MATCHER_UPGRADED" }] };
  }
}

/**
 * Persistence port for the prepared design (implemented against 047 once
 * approved). Reads are split by audience so authorization stays explicit:
 * candidates only ever see their own results for currently open jobs, and
 * only recruiting staff may list candidates for a requisition.
 */
export type MatchResultStore = {
  upsertJobAnalysis(analysis: StoredJobAnalysis): Promise<void>;
  upsertResults(results: StoredMatchResult[]): Promise<void>;
  markStale(target: RecalculationPlan["markStale"][number], at: string): Promise<number>;
  enqueue(tasks: RecalculationTask[], at: string): Promise<void>;
  /** Candidate → their own results, restricted by the caller to open, published jobs. */
  resultsForCandidate(candidateId: string, openRequisitionIds: readonly string[]): Promise<StoredMatchResult[]>;
  /** Recruiting staff only (caller must hold assertRecruitingStaff()). */
  resultsForRequisition(requisitionId: string, limit: number): Promise<StoredMatchResult[]>;
};
