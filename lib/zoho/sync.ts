/**
 * The Zoho sync worker: drains `zoho_sync_queue` into the CRM.
 *
 * The queue is a durable outbox. An application is written to Neon first and
 * enqueued second, so CRM downtime can delay a sync but can never lose a
 * submission. This file is the other half of that promise and it keeps it in
 * three ways:
 *
 *   * Nothing here is imported by the apply path. The only entry points are the
 *     cron route and admin tooling, so a Zoho failure cannot become a 500 on
 *     the form a candidate just submitted.
 *   * No per-job failure escapes `processDueSyncJobs`. One poison row must not
 *     stop the other nineteen in the batch.
 *   * Credentials are checked before anything is claimed. A deployment with a
 *     broken CRM connection burns no attempts, so no application drifts towards
 *     ABANDONED because of an outage that had nothing to do with it.
 *
 * Jobs are processed one at a time, deliberately. Zoho meters API credits per
 * minute, and firing twenty upserts concurrently is the reliable way to turn a
 * healthy batch into a 429 that penalises every later call too.
 */

import { db, isUuid, tx, type Queryable } from "@/lib/neon/client";
import {
  claimDueSyncJobs,
  completeSyncJob,
  failSyncJob,
  insertActivity,
  MAX_SYNC_ATTEMPTS,
} from "@/lib/neon/crm";
import { setZohoContactId } from "@/lib/neon/candidates";
import { markApplicationSynced } from "@/lib/neon/applications";
import type { SyncEntityType, ZohoSyncQueueRow } from "@/lib/neon/types";
import {
  buildContactPayload,
  ZohoMappingError,
  type ZohoContactSource,
} from "@/lib/zoho/field-map";
import { upsertContact, ZohoApiError, type FetchLike } from "@/lib/zoho/crm-client";
import { isZohoConfigured, ZohoConfigError } from "@/lib/zoho/token";

/** Jobs claimed per run when the caller does not say. */
export const DEFAULT_SYNC_BATCH = 20;

/**
 * How long a claimed job may stay IN_PROGRESS before it is considered stranded.
 *
 * Comfortably longer than the slowest possible job (one API call with a 20s
 * timeout, plus retries) and shorter than a cron interval's worth of silence,
 * so a crashed worker's rows come back within one cycle.
 */
export const STALE_CLAIM_MINUTES = 10;

export interface SyncSummary {
  /** Jobs taken from the queue by this run. */
  claimed: number;
  /** Written to Zoho and acknowledged. */
  succeeded: number;
  /** Failed with a retryable error; scheduled for another attempt. */
  failed: number;
  /** Given up on: either a permanent error, or the last attempt ran out. */
  abandoned: number;
  /** Rows reclaimed from a worker that died holding them. */
  reaped: number;
}

export interface ProcessOptions {
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Structured log sink. Defaults to console. */
  log?: (entry: Record<string, unknown>) => void;
}

/**
 * Claim and process due sync jobs.
 *
 * Never throws for a per-job problem. It can still throw if the queue itself is
 * unreachable, because then there is nothing to report and no state to update;
 * the cron route turns that into a 500.
 */
export async function processDueSyncJobs(
  limit: number = DEFAULT_SYNC_BATCH,
  options: ProcessOptions = {},
): Promise<SyncSummary> {
  const log = options.log ?? defaultLog;
  const summary: SyncSummary = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    abandoned: 0,
    reaped: 0,
  };

  // First, because a stranded row is due work and should be eligible for this
  // run rather than waiting for the next one.
  summary.reaped = await reapStaleSyncJobs();
  if (summary.reaped > 0) {
    log({ event: "zoho-sync.reaped", count: summary.reaped });
  }

  if (!isZohoConfigured()) {
    // Claiming would increment attempts on work this deployment cannot do.
    log({ event: "zoho-sync.skipped", reason: "not-configured" });
    return summary;
  }

  // Counting before claiming costs one indexed query and buys the guarantee
  // above: on an idle queue nothing touches the token endpoint at all, and on a
  // busy queue a credential failure is discovered before any row is claimed.
  const due = await countDueSyncJobs();
  if (due === 0) {
    return summary;
  }

  const jobs = await claimDueSyncJobs(limit);
  summary.claimed = jobs.length;
  if (jobs.length === 0) {
    // Another worker took them between the count and the claim. Not an error:
    // that is exactly what FOR UPDATE SKIP LOCKED is for.
    return summary;
  }

  await stampClaimedAt(jobs.map((job) => job.id), log);

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const outcome = await processJob(job, options, log);
    summary[outcome.result] += 1;

    if (outcome.stopBatch) {
      // Zoho has told us to slow down. Continuing would extend the penalty, so
      // the rest of the batch is released now with the rate-limit reason and a
      // schedule, instead of being left IN_PROGRESS for the reaper to find in
      // ten minutes.
      log({
        event: "zoho-sync.rate-limited",
        remaining: jobs.length - index - 1,
        retryAfterSeconds: outcome.retryAfterSeconds,
      });

      for (const deferred of jobs.slice(index + 1)) {
        // The attempt was already consumed at claim time; that is the price of
        // counting attempts on claim rather than on failure, and it is still
        // the right trade because it is what stops a worker-killing row from
        // being retried forever. Lowering the counter here would undo that.
        const released = await releaseRetryable(
          deferred,
          "Not attempted: Zoho rate limit hit earlier in the same batch.",
          outcome.retryAfterSeconds,
        );
        summary[released] += 1;
      }
      break;
    }
  }

  log({ event: "zoho-sync.done", ...summary });
  return summary;
}

/**
 * Put rows stranded by a dead worker back into the retry stream.
 *
 * `claimDueSyncJobs` only picks up PENDING and FAILED, so a row left
 * IN_PROGRESS by a process that was killed mid-request is invisible to it
 * forever — the application silently never reaches the CRM. That is the hole
 * migration 002 added `claimed_at` to close.
 *
 * The lease is read as `COALESCE(claimed_at, updated_at)` because
 * `claimDueSyncJobs` does not itself write `claimed_at`; `stampClaimedAt` below
 * does, immediately after, but a worker that dies in between would leave it
 * null. `updated_at` is maintained by the table's BEFORE UPDATE trigger, so the
 * claim always bumped it, which makes it a correct fallback lease clock.
 *
 * Returns rows to FAILED rather than PENDING: FAILED is claimable, and it keeps
 * `last_error` meaningful for whoever reads the admin view.
 */
export async function reapStaleSyncJobs(runner: Queryable = db): Promise<number> {
  const rows = await runner.query<{ id: string }>(
    `UPDATE zoho_sync_queue
        SET status = 'FAILED',
            claimed_at = NULL,
            last_error = $2,
            next_attempt_at = NOW()
      WHERE status = 'IN_PROGRESS'
        AND COALESCE(claimed_at, updated_at) < NOW() - make_interval(mins => $1::int)
      RETURNING id`,
    [
      STALE_CLAIM_MINUTES,
      `Reclaimed after ${STALE_CLAIM_MINUTES} minutes IN_PROGRESS: the worker that ` +
        "claimed this job did not finish it.",
    ],
  );
  return rows.length;
}

// --------------------------------------------------------------------- one job

type JobResult = "succeeded" | "failed" | "abandoned";

interface JobOutcome {
  result: JobResult;
  /** True when the rest of the batch must not be attempted. */
  stopBatch: boolean;
  retryAfterSeconds: number | null;
}

async function processJob(
  job: ZohoSyncQueueRow,
  options: ProcessOptions,
  log: (entry: Record<string, unknown>) => void,
): Promise<JobOutcome> {
  try {
    const source = await loadSyncSource(job.entity_type, job.entity_id);

    if (!source) {
      // The worker runs behind the request that enqueued it, so the entity can
      // legitimately have been deleted in between. There is nothing to sync and
      // nothing to retry.
      await abandonSyncJob(
        job.id,
        `${job.entity_type} ${job.entity_id} no longer exists; nothing to sync.`,
      );
      return done("abandoned");
    }

    // Both operations build the same payload from current state. UPDATE_STATUS
    // is not a diff to replay: the queue deliberately stores no before-image,
    // so a job that was queued three status changes ago still writes the status
    // the record has now.
    const payload = buildContactPayload(source.contact);

    const result = await upsertContact(payload, { fetchImpl: options.fetchImpl });

    await recordSuccess(job, source, result.id);

    log({
      event: "zoho-sync.synced",
      jobId: job.id,
      entityType: job.entity_type,
      entityId: job.entity_id,
      zohoRecordId: result.id,
      action: result.action,
    });

    return done("succeeded");
  } catch (error) {
    return handleJobError(job, error, log);
  }
}

async function handleJobError(
  job: ZohoSyncQueueRow,
  error: unknown,
  log: (entry: Record<string, unknown>) => void,
): Promise<JobOutcome> {
  const message = error instanceof Error ? error.message : String(error);
  const retryable = isRetryable(error);
  const retryAfterSeconds =
    error instanceof ZohoApiError ? error.retryAfterSeconds : null;

  log({
    event: retryable ? "zoho-sync.failed" : "zoho-sync.abandoned",
    jobId: job.id,
    entityType: job.entity_type,
    entityId: job.entity_id,
    attempts: job.attempts,
    kind: error instanceof ZohoApiError ? error.kind : error instanceof Error ? error.name : "unknown",
    // The message is built from status codes, Zoho error codes and field API
    // names only. No token, header or request body ever reaches it.
    error: message,
  });

  try {
    if (!retryable) {
      // A permanent error must not consume the remaining attempts. Eight
      // retries over eight hours on a record Zoho will never accept only delays
      // the moment somebody notices.
      await abandonSyncJob(job.id, message);
      return done("abandoned");
    }

    const result = await releaseRetryable(job, message, retryAfterSeconds);
    return {
      result,
      stopBatch: error instanceof ZohoApiError && error.kind === "RATE_LIMIT",
      retryAfterSeconds,
    };
  } catch (bookkeepingError) {
    // The queue write itself failed, which means the row is still IN_PROGRESS.
    // The reaper will recover it; swallowing here keeps the rest of the batch
    // running, which is the whole reason this loop catches at all.
    log({
      event: "zoho-sync.bookkeeping-failed",
      jobId: job.id,
      error:
        bookkeepingError instanceof Error ? bookkeepingError.message : String(bookkeepingError),
    });
    return done("failed");
  }
}

function done(result: JobResult): JobOutcome {
  return { result, stopBatch: false, retryAfterSeconds: null };
}

/**
 * Whether an error means "try the same payload again later".
 *
 * Every error type this file can see carries its own `retryable` flag:
 * ZohoApiError, ZohoMappingError, ZohoAuthError, ZohoConfigError. A type with
 * no opinion (a Postgres error, a programming mistake) is treated as retryable,
 * because the alternative is abandoning a real application on a bug.
 */
function isRetryable(error: unknown): boolean {
  if (error instanceof ZohoMappingError) {
    return false;
  }
  if (error instanceof ZohoConfigError) {
    return false;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    typeof (error as { retryable?: unknown }).retryable === "boolean"
  ) {
    return (error as { retryable: boolean }).retryable;
  }
  return true;
}

/**
 * Mark a job failed and, when Zoho asked for a specific wait, honour it.
 *
 * `failSyncJob` owns the backoff curve (2^attempts minutes) and flips the row
 * to ABANDONED once attempts reach MAX_SYNC_ATTEMPTS. Its schedule is almost
 * always longer than a Retry-After, so the extra push below only fires for an
 * unusually long penalty.
 */
async function releaseRetryable(
  job: ZohoSyncQueueRow,
  message: string,
  retryAfterSeconds: number | null,
): Promise<"failed" | "abandoned"> {
  const row = await failSyncJob(job.id, message);

  if (retryAfterSeconds !== null && retryAfterSeconds > 0) {
    await deferSyncJob(job.id, retryAfterSeconds);
  }

  // The row is gone only if somebody deleted it mid-flight; treat the attempt
  // as spent either way. Fall back to the attempt count rather than guessing.
  const abandoned = row
    ? row.status === "ABANDONED"
    : job.attempts >= MAX_SYNC_ATTEMPTS;

  return abandoned ? "abandoned" : "failed";
}

/**
 * Stop retrying a job now, keeping the reason.
 *
 * `failSyncJob` only abandons at the attempt ceiling, which is right for a
 * transient fault and wrong for a payload Zoho will never accept. Nothing is
 * ever deleted from the queue: "which applications never reached the CRM" has
 * to stay answerable.
 */
async function abandonSyncJob(
  id: string,
  reason: string,
  runner: Queryable = db,
): Promise<void> {
  await runner.query(
    `UPDATE zoho_sync_queue
        SET status = 'ABANDONED',
            claimed_at = NULL,
            last_error = $2
      WHERE id = $1
        AND status <> 'SUCCEEDED'`,
    [id, truncate(reason, 2000)],
  );
}

/** Push a job's next attempt out to at least `seconds` from now. */
async function deferSyncJob(
  id: string,
  seconds: number,
  runner: Queryable = db,
): Promise<void> {
  await runner.query(
    `UPDATE zoho_sync_queue
        SET next_attempt_at = GREATEST(
              next_attempt_at,
              NOW() + make_interval(secs => $2::double precision)
            )
      WHERE id = $1`,
    [id, seconds],
  );
}

/**
 * Record the lease time on rows this run claimed.
 *
 * `claimDueSyncJobs` predates `claimed_at` and does not set it. Stamping it
 * here keeps the column and its partial index meaningful, and the reaper's
 * `updated_at` fallback covers the gap between the claim and this statement.
 * A failure is logged and ignored for the same reason.
 */
async function stampClaimedAt(
  ids: readonly string[],
  log: (entry: Record<string, unknown>) => void,
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  try {
    await db.query(
      `UPDATE zoho_sync_queue
          SET claimed_at = NOW()
        WHERE id = ANY($1::uuid[])
          AND status = 'IN_PROGRESS'`,
      [ids],
    );
  } catch (error) {
    log({
      event: "zoho-sync.claim-stamp-failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function countDueSyncJobs(runner: Queryable = db): Promise<number> {
  const rows = await runner.query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM zoho_sync_queue
      WHERE status IN ('PENDING', 'FAILED')
        AND next_attempt_at <= NOW()`,
  );
  return rows[0]?.count ?? 0;
}

// ------------------------------------------------------------------ entity load

interface SyncSource {
  contact: ZohoContactSource;
  candidateId: string;
  /** Null when the candidate has no application yet. */
  applicationId: string | null;
}

interface SourceRow {
  candidate_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  application_id: string | null;
  application_reference: string | null;
  application_status: string | null;
  applied_at: Date | null;
  job_title: string | null;
  recruiter_name: string | null;
}

/**
 * Load everything the payload needs in one round trip.
 *
 * Written as SQL rather than composed from the per-table readers because the
 * recruiter's display name lives in a third table, and four sequential reads
 * per job multiplies into real latency across a batch.
 */
async function loadSyncSource(
  entityType: SyncEntityType,
  entityId: string,
  runner: Queryable = db,
): Promise<SyncSource | null> {
  if (!isUuid(entityId)) {
    return null;
  }

  const rows =
    entityType === "APPLICATION"
      ? await runner.query<SourceRow>(APPLICATION_SOURCE_SQL, [entityId])
      : await runner.query<SourceRow>(CANDIDATE_SOURCE_SQL, [entityId]);

  const row = rows[0];
  if (!row) {
    return null;
  }

  // The recruitment fields travel together: a partial set would write a job
  // title with no status or a status with no date, which reads as corruption to
  // whoever opens the contact.
  const hasApplication =
    row.application_id !== null &&
    row.application_reference !== null &&
    row.application_status !== null &&
    row.applied_at !== null &&
    row.job_title !== null;

  return {
    candidateId: row.candidate_id,
    applicationId: row.application_id,
    contact: {
      firstName: row.first_name,
      lastName: row.last_name ?? "",
      email: row.email,
      phone: row.phone,
      application: hasApplication
        ? {
            reference: row.application_reference as string,
            status: row.application_status as string,
            appliedAt: row.applied_at as Date,
            jobTitle: row.job_title as string,
            assignedRecruiterName: row.recruiter_name,
          }
        : null,
    },
  };
}

const SOURCE_COLUMNS = `
  c.id         AS candidate_id,
  c.first_name AS first_name,
  c.last_name  AS last_name,
  c.email      AS email,
  c.phone      AS phone,
  a.id         AS application_id,
  a.reference  AS application_reference,
  a.status     AS application_status,
  a.applied_at AS applied_at,
  j.title      AS job_title,
  r.full_name  AS recruiter_name
`;

const APPLICATION_SOURCE_SQL = `
  SELECT ${SOURCE_COLUMNS}
    FROM applications a
    JOIN candidates c ON c.id = a.candidate_id
    JOIN jobs j       ON j.id = a.job_id
    LEFT JOIN admin_users r ON r.id = a.assigned_recruiter_id
   WHERE a.id = $1
`;

/**
 * A CANDIDATE job syncs the person, with their most recent application as the
 * recruitment context. LATERAL rather than a window function so the planner can
 * use applications_candidate_idx (added in migration 002 for exactly this
 * lookup) and stop after one row.
 */
const CANDIDATE_SOURCE_SQL = `
  SELECT ${SOURCE_COLUMNS}
    FROM candidates c
    LEFT JOIN LATERAL (
      SELECT ap.id, ap.reference, ap.status, ap.applied_at, ap.job_id,
             ap.assigned_recruiter_id
        FROM applications ap
       WHERE ap.candidate_id = c.id
       ORDER BY ap.applied_at DESC
       LIMIT 1
    ) a ON TRUE
    LEFT JOIN jobs j       ON j.id = a.job_id
    LEFT JOIN admin_users r ON r.id = a.assigned_recruiter_id
   WHERE c.id = $1
`;

// ------------------------------------------------------------- success write-back

/**
 * Everything that has to become true once Zoho accepts the record.
 *
 * One transaction, because these four facts are one fact: the queue row is
 * done, the candidate has a CRM id the dashboard can deep-link to, the
 * application is stamped as synced, and the timeline says so. A half-applied
 * version of that is a recruiter looking at an application marked synced with
 * no contact to open.
 *
 * A failure here is reported as a retryable job failure even though Zoho
 * already accepted the record, which is the safe direction: the Zoho operation
 * is an upsert matched on email, so the retry updates the same contact and
 * returns the same id. The opposite choice — treating the write-back as
 * best-effort — would leave a contact in Zoho that no row in Neon points at.
 */
async function recordSuccess(
  job: ZohoSyncQueueRow,
  source: SyncSource,
  zohoRecordId: string,
): Promise<void> {
  await tx(async (t) => {
    await completeSyncJob(job.id, zohoRecordId, t);
    await setZohoContactId(source.candidateId, zohoRecordId, t);

    if (source.applicationId) {
      await markApplicationSynced(source.applicationId, t);
      await insertActivity(t, {
        applicationId: source.applicationId,
        // No staff member did this; the worker did.
        actorId: null,
        kind: "CRM_SYNCED",
        detail: `Synced to Zoho CRM contact ${zohoRecordId}.`,
      });
    }
  });
}

// ------------------------------------------------------------------------ bits

function defaultLog(entry: Record<string, unknown>): void {
  // One line of JSON, so Vercel's log search can filter on the event name.
  console.info(JSON.stringify(entry));
}

function truncate(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 3)}...`;
}
