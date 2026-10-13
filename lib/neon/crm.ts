/**
 * Recruiter-facing CRM plumbing: notes, the activity audit trail, and the Zoho
 * outbox.
 *
 * Every function takes an optional `runner`, so a caller that is already inside
 * a transaction passes it in and the write joins that transaction instead of
 * opening a second one. That is what makes "application saved and APPLIED
 * activity logged and sync enqueued" an all-or-nothing operation rather than
 * three writes that can half-succeed.
 */

import { db, tx, type Queryable } from "./client";
import type {
  ActivityKind,
  ApplicationActivityRow,
  ApplicationStatus,
  SyncEntityType,
  SyncOperation,
  ZohoSyncQueueRow,
} from "./types";


const ACTIVITY_COLUMNS =
  "id, application_id, actor_id, kind, from_status, to_status, detail, created_at";

const SYNC_COLUMNS = `
  id, entity_type, entity_id, operation, status, attempts, last_error,
  next_attempt_at, zoho_record_id, created_at, updated_at
`;

/** An activity plus the actor's display name. */
export interface ActivityWithActor extends ApplicationActivityRow {
  /** Null for system-generated events, e.g. a candidate's own submission. */
  actor_name: string | null;
}

// ------------------------------------------------------------------- activities

export interface InsertActivityInput {
  applicationId: string;
  /** Null for events the system or the candidate caused, not a staff member. */
  actorId: string | null;
  kind: ActivityKind;
  detail?: string | null;
  /** Only meaningful for STATUS_CHANGED. */
  fromStatus?: ApplicationStatus | string | null;
  toStatus?: ApplicationStatus | string | null;
}

/**
 * The single place any row enters `application_activities`.
 *
 * Takes an explicit runner rather than defaulting to one, because an activity
 * is always a consequence of something else and should commit or roll back with
 * it. `logActivity` below is the standalone wrapper for the rare caller that
 * genuinely has nothing to attach to.
 *
 * The table is append-only; nothing in this module ever updates or deletes a
 * row here, because the history is the product.
 *
 * ONE THING DOES REMOVE ROWS, and it is not in this module.
 * application_activities.application_id is ON DELETE CASCADE, so deleting an
 * application takes its whole timeline with it. That is all-or-nothing by
 * design: the trail for a record that still exists can never be edited or
 * thinned, which is the property that makes it worth reading.
 */
export async function insertActivity(
  t: Queryable,
  input: InsertActivityInput,
): Promise<ApplicationActivityRow> {
  const rows = await t.query<ApplicationActivityRow>(
    `INSERT INTO application_activities (
       application_id, actor_id, kind, from_status, to_status, detail
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${ACTIVITY_COLUMNS}`,
    [
      input.applicationId,
      input.actorId,
      input.kind,
      input.fromStatus ?? null,
      input.toStatus ?? null,
      input.detail ?? null,
    ],
  );

  const activity = rows[0];
  if (!activity) {
    throw new Error("Insert of application_activities returned no row.");
  }
  return activity;
}

/** Standalone activity write, for events with nothing else to commit alongside. */
export async function logActivity(
  applicationId: string,
  actorId: string | null,
  kind: ActivityKind,
  detail?: string | null,
  runner: Queryable = db,
): Promise<ApplicationActivityRow> {
  return insertActivity(runner, { applicationId, actorId, kind, detail: detail ?? null });
}

/** Timeline for one application, newest first, with actor names resolved. */
export async function listActivities(
  applicationId: string,
  runner: Queryable = db,
): Promise<ActivityWithActor[]> {
  return runner.query<ActivityWithActor>(
    `SELECT v.id, v.application_id, v.actor_id, v.kind, v.from_status, v.to_status,
            v.detail, v.created_at,
            a.full_name AS actor_name
       FROM application_activities v
       LEFT JOIN admin_users a ON a.id = v.actor_id
      WHERE v.application_id = $1
      ORDER BY v.created_at DESC`,
    [applicationId],
  );
}

// -------------------------------------------------------------- Zoho sync queue

/** Attempts after which a job stops being retried. */
export const MAX_SYNC_ATTEMPTS = 8;

/**
 * Put an entity on the Zoho outbox.
 *
 * Deduplicated against rows that have not been picked up yet: if a recruiter
 * moves an application through three statuses in a minute, one UPDATE_STATUS
 * job is enough, because the worker reads the current state when it runs rather
 * than replaying a diff. IN_PROGRESS is deliberately excluded from that check:
 * a job already being processed cannot see a change made after it started, so
 * that change needs a job of its own.
 *
 * Returns null when an equivalent job was already queued, which is a no-op, not
 * a failure. Two simultaneous enqueues can still both insert; a duplicate sync
 * is harmless because the Zoho operation is an upsert.
 */
/**
 * Zoho CRM syncing, switched off.
 *
 * WHY IT IS OFF. The integration worked: it was authenticated against
 * jobs@consultamerica.com and delivered ten of ten jobs. What it did not have
 * was a reader. Two candidate records ever reached Zoho, both in the first two
 * days, and neither was looked at again. A pipeline nobody reads is not a
 * feature, it is a second copy of the truth that can quietly drift from the
 * first, which it already had: both Zoho contacts still say NEW for
 * applications that no longer exist here.
 *
 * WHY THE CODE IS STILL HERE. Pulling the enqueue out of lib/neon/applications.ts
 * means editing the two most important writes in the product, the one that
 * saves an application and the one that moves a candidate's stage. The whole
 * benefit of removal is "stop talking to Zoho", and this one line achieves all
 * of it at none of that risk. The tables are dropped separately, in
 * db/neon/005_cleanup.sql.
 *
 * TO TURN IT BACK ON: set this true AND restore the tables. The second half
 * matters, because once 005 has run against a database the queue table is gone
 * and this flag alone would make every write fail.
 */
const ZOHO_SYNC_ENABLED = false;

export async function enqueueZohoSync(
  entityType: SyncEntityType,
  entityId: string,
  operation: SyncOperation,
  runner: Queryable = db,
): Promise<ZohoSyncQueueRow | null> {
  /*
    The switch. Returns before any statement is built, so no row is written and
    nothing touches zoho_sync_queue. That is what makes dropping the table safe:
    this runs inside the same transaction as the application insert and the
    stage change, and a reference to a table that no longer exists would fail
    both of them.
  */
  if (!ZOHO_SYNC_ENABLED) return null;

  const rows = await runner.query<ZohoSyncQueueRow>(
    `INSERT INTO zoho_sync_queue (entity_type, entity_id, operation)
     SELECT $1::text, $2::uuid, $3::text
      WHERE NOT EXISTS (
        SELECT 1 FROM zoho_sync_queue
         WHERE entity_type = $1::text
           AND entity_id = $2::uuid
           AND operation = $3::text
           AND status IN ('PENDING', 'FAILED')
      )
     RETURNING ${SYNC_COLUMNS}`,
    [entityType, entityId, operation],
  );

  return rows[0] ?? null;
}

/**
 * Take up to `limit` due jobs for this worker.
 *
 * `FOR UPDATE SKIP LOCKED` on the inner SELECT is what makes two workers safe:
 * rows another transaction has locked are skipped rather than waited on, so the
 * second worker gets different rows instead of blocking and then processing the
 * same ones. The whole claim is a single statement, so the lock is held for the
 * length of that statement and the IN_PROGRESS flip commits with it.
 *
 * `attempts` is incremented here, at claim time, not on failure. A worker that
 * is killed mid-request never reaches `failSyncJob`, and if attempts only grew
 * on a clean failure a job that reliably crashes the worker would be retried
 * forever. Counting the attempt when it starts means every poison row
 * eventually reaches ABANDONED.
 *
 * The cost of that choice: a job left IN_PROGRESS by a dead worker is not
 * re-claimed by this query. A reaper that resets stale IN_PROGRESS rows back to
 * FAILED is still needed and is not in this file.
 */
export async function claimDueSyncJobs(
  limit: number,
  runner: Queryable = db,
): Promise<ZohoSyncQueueRow[]> {
  const bounded = Math.min(Math.max(1, Math.floor(limit)), 100);

  return runner.query<ZohoSyncQueueRow>(
    `UPDATE zoho_sync_queue q
        SET status = 'IN_PROGRESS',
            attempts = q.attempts + 1
      WHERE q.id IN (
        SELECT id
          FROM zoho_sync_queue
         WHERE status IN ('PENDING', 'FAILED')
           AND next_attempt_at <= NOW()
         ORDER BY next_attempt_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING ${SYNC_COLUMNS}`,
    [bounded],
  );
}

/**
 * Mark a claimed job done.
 *
 * `last_error` is cleared so a row that failed twice and then succeeded does
 * not keep showing a stale error in the admin view.
 */
export async function completeSyncJob(
  id: string,
  zohoRecordId: string | null,
  runner: Queryable = db,
): Promise<ZohoSyncQueueRow | null> {
  const rows = await runner.query<ZohoSyncQueueRow>(
    `UPDATE zoho_sync_queue
        SET status = 'SUCCEEDED',
            zoho_record_id = COALESCE($2, zoho_record_id),
            last_error = NULL
      WHERE id = $1
      RETURNING ${SYNC_COLUMNS}`,
    [id, zohoRecordId],
  );
  return rows[0] ?? null;
}

/**
 * Mark a claimed job failed and schedule the retry.
 *
 * Backoff is 2^attempts minutes: roughly 2, 4, 8 ... 256 minutes, so eight
 * attempts spread over about eight hours rather than hammering a Zoho outage.
 * `attempts` was already incremented at claim time, so the exponent is read
 * straight off the row inside the same statement and no second read is needed.
 *
 * At MAX_SYNC_ATTEMPTS the row becomes ABANDONED, which stops retrying but
 * keeps the row and its last error. Nothing is ever deleted from the queue:
 * "which applications never reached the CRM" has to stay answerable.
 */
export async function failSyncJob(
  id: string,
  error: string,
  runner: Queryable = db,
): Promise<ZohoSyncQueueRow | null> {
  const rows = await runner.query<ZohoSyncQueueRow>(
    `UPDATE zoho_sync_queue
        SET status = CASE WHEN attempts >= $3 THEN 'ABANDONED' ELSE 'FAILED' END,
            last_error = $2,
            next_attempt_at = NOW()
              + (INTERVAL '1 minute' * power(2, LEAST(attempts, $3))::double precision)
      WHERE id = $1
      RETURNING ${SYNC_COLUMNS}`,
    // Errors from an HTTP client can be enormous; last_error is for a human
    // reading the admin view, not a full stack trace.
    [id, summarise(error, 2000), MAX_SYNC_ATTEMPTS],
  );
  return rows[0] ?? null;
}

/** Queue rows for one entity, newest first. Used by the admin sync view. */
export async function listSyncJobsForEntity(
  entityType: SyncEntityType,
  entityId: string,
  runner: Queryable = db,
): Promise<ZohoSyncQueueRow[]> {
  return runner.query<ZohoSyncQueueRow>(
    `SELECT ${SYNC_COLUMNS}
       FROM zoho_sync_queue
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC`,
    [entityType, entityId],
  );
}

/** Truncate for storage in a column a human reads, keeping the start. */
function summarise(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 3)}...`;
}
