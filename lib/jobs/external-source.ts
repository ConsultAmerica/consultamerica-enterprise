/**
 * Approved external jobs enter through an adapter.
 * Indeed and Dice are visual references only. This module does not scrape them.
 */
export type ExternalJobRecord = {
  source: string;
  externalJobId: string;
  sourceUrl: string;
  title: string;
  company?: string;
  location?: string;
  description?: string;
  applyUrl?: string;
  status?: "open" | "closed" | "unknown";
};

export type NormalizedExternalJob = {
  source: string;
  externalJobId: string;
  sourceUrl: string;
  title: string;
  company: string;
  location: string;
  description: string;
  externalApplyUrl?: string;
  sourceStatus: "open" | "closed" | "unknown";
};

export function normalizeExternalJob(record: ExternalJobRecord): NormalizedExternalJob | null {
  if (!record.source || !record.externalJobId || !record.title) return null;
  let sourceUrl: string;
  try {
    const url = new URL(record.sourceUrl);
    if (url.protocol !== "https:") return null;
    sourceUrl = url.toString();
  } catch {
    return null;
  }
  let externalApplyUrl: string | undefined;
  if (record.applyUrl) {
    try {
      const apply = new URL(record.applyUrl);
      if (apply.protocol !== "https:") return null;
      externalApplyUrl = apply.toString();
    } catch {
      return null;
    }
  }
  return {
    source: record.source,
    externalJobId: record.externalJobId,
    sourceUrl,
    title: record.title.trim(),
    company: record.company?.trim() || "Unknown employer",
    location: record.location?.trim() || "Location not provided",
    description: record.description?.trim() || record.title.trim(),
    externalApplyUrl,
    sourceStatus: record.status ?? "unknown",
  };
}

export function dedupeExternalJobs(jobs: NormalizedExternalJob[]): NormalizedExternalJob[] {
  const seen = new Set<string>();
  const unique: NormalizedExternalJob[] = [];
  for (const job of jobs) {
    const key = `${job.source}:${job.externalJobId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(job);
  }
  return unique;
}

export type VerificationProblem = "timeout" | "outage" | "rate_limit";

/** A confirmed close can expire a job. A failed check must be retried, not treated as closed. */
export function verificationDecision(input: {
  confirmedClosed: boolean;
  problem?: VerificationProblem;
}): "expire" | "retry" | "keep" {
  if (input.problem) return "retry";
  if (input.confirmedClosed) return "expire";
  return "keep";
}
