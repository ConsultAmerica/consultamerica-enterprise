import "server-only";

import {
  getJobById,
  listJobsNeedingConsultHire,
  setJobConsultHireState,
} from "@/lib/neon/jobs";
import type { JobRow } from "@/lib/neon/types";
import { logServerError } from "@/lib/observability/logger";

import { createRoleInterview, consultHireConfig } from "./client";

/**
 * Generating and re-generating a job's AI interview, and recording what
 * happened.
 *
 * lib/consulthire/client.ts owns the HTTP call and knows nothing about the
 * database; lib/neon/jobs.ts owns the columns and knows nothing about
 * ConsultHire. This file is the only place the two meet, which is why it is
 * also the only place that decides what "already generated" means.
 *
 * THE ONE RULE EVERY CALLER DEPENDS ON: nothing here throws. The publish path
 * calls it after a job has already been published and the bulk path calls it in
 * a loop over other people's jobs. A throw in either case would turn a
 * completed action into an error message, or abandon nineteen jobs because the
 * twentieth has an unparseable description. Every failure is a returned result
 * and a log line under `consulthire/*`.
 */

export type GenerateOutcome =
  /** A link exists now. `created` is false when ConsultHire updated an existing role. */
  | { ok: true; outcome: "generated"; url: string; created: boolean }
  /** There was already a usable link and nothing was asked of ConsultHire. */
  | { ok: true; outcome: "unchanged"; url: string }
  /** Nothing was attempted, and that is not a failure worth reporting as one. */
  | { ok: true; outcome: "skipped"; reason: "not-configured" | "not-published" }
  | { ok: false; error: string; retryable: boolean };

export type GenerateOptions = {
  /**
   * Regenerate even when the job already has a READY link.
   *
   * Off by default, which is what makes the publish hook and the admin action
   * idempotent: pressing Publish twice, or Generate twice, costs one LLM call.
   * On for a deliberate "the description changed, rebuild the interview".
   */
  force?: boolean;
};

/**
 * Generate (or refresh) the role interview for one job.
 *
 * Status is moved to PENDING before the call rather than after it. The call can
 * take most of a minute because an interview plan is an LLM round trip at the
 * far end, and without this the admin screen would read NONE for that whole
 * time, which is indistinguishable from "the hook never ran".
 */
export async function generateRoleInterview(
  jobId: string,
  options: GenerateOptions = {},
): Promise<GenerateOutcome> {
  // Checked before the job is even read. A deployment with no ConsultHire
  // credentials is a valid deployment that offers Easy Apply only, so this is
  // not an error and must not be written to the job as one: a FAILED pill on
  // every published job would train recruiters to ignore the column.
  if (!consultHireConfig()) {
    return { ok: true, outcome: "skipped", reason: "not-configured" };
  }

  let job: JobRow | null;
  try {
    job = await getJobById(jobId);
  } catch (error) {
    logServerError("consulthire/generate.load", error, { jobId });
    return { ok: false, error: COULD_NOT_READ, retryable: true };
  }

  if (!job) {
    // The job was deleted between the caller deciding to generate and this
    // read. Nothing to attach a link to and nothing to report.
    return { ok: true, outcome: "skipped", reason: "not-published" };
  }

  if (job.status !== "PUBLISHED") {
    return { ok: true, outcome: "skipped", reason: "not-published" };
  }

  if (!options.force && job.consulthire_status === "READY" && job.consulthire_url) {
    return { ok: true, outcome: "unchanged", url: job.consulthire_url };
  }

  await markPending(job.id);

  const result = await createRoleInterview(job);

  if (!result.ok) {
    // The error text comes from client.ts and was written for a recruiter to
    // read, so it is stored verbatim and rendered on the admin screen. A
    // generic sentence here would tell somebody their interview failed and
    // nothing about what to change.
    await record(job.id, { status: "FAILED", error: result.error });
    return { ok: false, error: result.error, retryable: result.retryable };
  }

  await record(job.id, {
    status: "READY",
    roleId: result.roleId,
    slug: result.slug,
    url: result.url,
  });

  return { ok: true, outcome: "generated", url: result.url, created: result.created };
}

/**
 * Generate for every published job that has no usable link.
 *
 * SEQUENTIAL, NOT Promise.all, for the same reason
 * app/admin/applications/actions.ts moves stages one at a time: each generation
 * is an LLM call at the far end, and firing twenty at once is how a serverless
 * function times out and leaves a recruiter with a bulk action that half
 * applied for reasons nobody can reconstruct. Twenty slow successes beat five
 * fast ones and fifteen unexplained failures.
 *
 * Partial success is reported rather than hidden. The caller renders the three
 * numbers, so "fourteen generated, three already had one, three failed" is what
 * the recruiter sees.
 */
export async function generateRoleInterviewsForPublishedJobs(
  limit = 25,
): Promise<{ generated: number; unchanged: number; failed: number; attempted: number }> {
  let jobs: JobRow[];
  try {
    jobs = await listJobsNeedingConsultHire(limit);
  } catch (error) {
    logServerError("consulthire/generate.bulk-load", error);
    return { generated: 0, unchanged: 0, failed: 0, attempted: 0 };
  }

  let generated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const job of jobs) {
    const result = await generateRoleInterview(job.id);
    if (!result.ok) failed += 1;
    else if (result.outcome === "generated") generated += 1;
    else if (result.outcome === "unchanged") unchanged += 1;
    // "skipped" is counted in neither: the job was unpublished or deleted
    // while the sweep was running, so nothing was attempted for it.
  }

  return { generated, unchanged, failed, attempted: jobs.length };
}

// ------------------------------------------------------------------ internals

const COULD_NOT_READ =
  "The job could not be read, so no AI interview was generated. Please try again.";

/**
 * Both status writes swallow their own failures.
 *
 * A database write failing here must not change the outcome the caller reports:
 * on the publish path the job is already published, and on the manual path the
 * interview either exists at ConsultHire or it does not, regardless of whether
 * we managed to write a pill colour. The consequence is a job stuck showing
 * PENDING, which the Generate action can clear, and which is a far better
 * outcome than a published job reporting an error about a column.
 */
async function markPending(jobId: string): Promise<void> {
  await record(jobId, { status: "PENDING" });
}

async function record(
  jobId: string,
  state: Parameters<typeof setJobConsultHireState>[1],
): Promise<void> {
  try {
    const updated = await setJobConsultHireState(jobId, state);
    if (!updated) {
      // The job was deleted mid-generation. Worth a log line, because it also
      // means a role now exists at ConsultHire with nothing pointing at it.
      logServerError(
        "consulthire/generate.orphan",
        new Error("Job vanished while its interview was being generated."),
        { jobId, status: state.status },
      );
    }
  } catch (error) {
    logServerError("consulthire/generate.record", error, { jobId, status: state.status });
  }
}
