import type { JobStatus } from "@/types/recruiting";

/** Statuses that may appear on the public portal when their dates are still valid. */
export const LIVE_JOB_STATUSES = ["PUBLISHED", "OPEN"] as const;

export type LiveJobStatus = (typeof LIVE_JOB_STATUSES)[number];

export type PublicationFields = {
  status: JobStatus | string;
  publishedAt?: string | null;
  publishAt?: string | null;
  expiresAt?: string | null;
  applicationDeadline?: string | null;
};

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function isPubliclyOpen(job: PublicationFields, now: Date = new Date()): boolean {
  if (!LIVE_JOB_STATUSES.includes(job.status as LiveJobStatus)) return false;
  const instant = now.getTime();
  const publishAt = time(job.publishAt);
  if (publishAt !== null && publishAt > instant) return false;
  const publishedAt = time(job.publishedAt);
  if (publishedAt !== null && publishedAt > instant) return false;
  const expiresAt = time(job.expiresAt);
  if (expiresAt !== null && expiresAt <= instant) return false;
  const deadline = time(job.applicationDeadline);
  if (deadline !== null && deadline <= instant) return false;
  return true;
}

export function isNewListing(postedAt: string, now: Date = new Date()): boolean {
  const posted = time(postedAt);
  if (posted === null) return false;
  return now.getTime() - posted <= 7 * 24 * 60 * 60 * 1000;
}

export type MaintenancePlan = {
  publishIds: string[];
  expireIds: string[];
};

export function planJobMaintenance(
  jobs: Array<PublicationFields & { id: string }>,
  now: Date = new Date(),
): MaintenancePlan {
  const publishIds: string[] = [];
  const expireIds: string[] = [];
  const instant = now.getTime();

  for (const job of jobs) {
    if (job.status === "SCHEDULED") {
      const publishAt = time(job.publishAt);
      if (publishAt !== null && publishAt <= instant) publishIds.push(job.id);
      continue;
    }
    if (!LIVE_JOB_STATUSES.includes(job.status as LiveJobStatus)) continue;
    const expiresAt = time(job.expiresAt);
    const deadline = time(job.applicationDeadline);
    if (
      (expiresAt !== null && expiresAt <= instant) ||
      (deadline !== null && deadline <= instant)
    ) {
      expireIds.push(job.id);
    }
  }

  return { publishIds, expireIds };
}
