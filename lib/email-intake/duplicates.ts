/**
 * Deterministic duplicate signals (pure). These only flag POSSIBLE duplicates
 * for the recruiter; nothing is merged or skipped automatically.
 */

import { fieldText } from "@/lib/email-intake/extraction";
import { canonical } from "@/lib/email-intake/normalize";
import type { DuplicateSignal, IntakeMessage, JobExtraction } from "@/lib/email-intake/types";

export type ExistingRecruitingItem = { id: string; title: string; locationName: string | null; status: string };

const TITLE_NOISE = new Set(["senior", "sr", "junior", "jr", "lead", "principal", "the", "a", "an", "of", "for", "and", "needed", "role", "position"]);

export function titleTokens(title: string): Set<string> {
  return new Set(
    canonical(title)
      .split(/[^a-z0-9+#]+/)
      .filter((t) => t.length > 1 && !TITLE_NOISE.has(t)),
  );
}

export function titleSimilarity(a: string, b: string): number {
  const x = titleTokens(a);
  const y = titleTokens(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / (x.size + y.size - shared);
}

function locationCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return true; // unknown location does not rule a duplicate out
  const x = titleTokens(a);
  const y = titleTokens(b);
  for (const t of x) if (y.has(t)) return true;
  return false;
}

const SIMILARITY_THRESHOLD = 0.6;

export function findDuplicateSignals(input: {
  message: Pick<IntakeMessage, "id" | "providerThreadId">;
  extraction: JobExtraction | null;
  threadMessages: IntakeMessage[];
  recentIntake: IntakeMessage[];
  requisitions: ExistingRecruitingItem[];
  jobs: ExistingRecruitingItem[];
}): DuplicateSignal[] {
  const signals: DuplicateSignal[] = [];
  const seen = new Set<string>();
  const add = (signal: DuplicateSignal) => {
    const key = `${signal.kind}|${signal.reference}`;
    if (!seen.has(key)) {
      seen.add(key);
      signals.push(signal);
    }
  };

  for (const other of input.threadMessages) {
    if (other.id === input.message.id) continue;
    if (other.linkedRequisitionId) {
      add({
        kind: "SAME_THREAD",
        reference: other.linkedRequisitionId,
        detail: "An earlier message in this email thread is already linked to a requisition. This may amend it.",
      });
    } else if (other.classification === "JOB_REQUIREMENT" || other.classification === "JOB_UPDATE") {
      add({ kind: "SAME_THREAD", reference: other.id, detail: "An earlier message in this thread is already in intake review." });
    }
  }

  const title = fieldText(input.extraction?.fields.title);
  const location = fieldText(input.extraction?.fields.location) || null;
  const reference = canonical(fieldText(input.extraction?.fields.clientReference));

  for (const other of input.recentIntake) {
    if (other.id === input.message.id || other.providerThreadId === input.message.providerThreadId) continue;
    const otherRef = canonical(fieldText(other.extraction?.fields.clientReference));
    if (reference && otherRef && reference === otherRef) {
      add({ kind: "SAME_REFERENCE", reference: other.id, detail: `Another intake email uses the same reference "${fieldText(other.extraction?.fields.clientReference)}".` });
      continue;
    }
    const otherTitle = fieldText(other.extraction?.fields.title);
    if (title && otherTitle && titleSimilarity(title, otherTitle) >= SIMILARITY_THRESHOLD &&
        locationCompatible(location, fieldText(other.extraction?.fields.location) || null)) {
      add({ kind: "SIMILAR_INTAKE", reference: other.id, detail: `Similar requirement received ${other.receivedAt.slice(0, 10)}: "${otherTitle}".` });
    }
  }

  if (title) {
    for (const req of input.requisitions) {
      if (["CANCELLED", "FILLED"].includes(req.status)) continue;
      if (titleSimilarity(title, req.title) >= SIMILARITY_THRESHOLD && locationCompatible(location, req.locationName)) {
        add({ kind: "SIMILAR_REQUISITION", reference: req.id, detail: `Existing ${req.status.toLowerCase()} requisition "${req.title}"${req.locationName ? ` (${req.locationName})` : ""}.` });
      }
    }
    for (const job of input.jobs) {
      if (["CLOSED", "EXPIRED", "ARCHIVED", "FILLED"].includes(job.status)) continue;
      if (titleSimilarity(title, job.title) >= SIMILARITY_THRESHOLD && locationCompatible(location, job.locationName)) {
        add({ kind: "SIMILAR_JOB", reference: job.id, detail: `Existing ${job.status.toLowerCase()} job posting "${job.title}"${job.locationName ? ` (${job.locationName})` : ""}.` });
      }
    }
  }

  return signals;
}
