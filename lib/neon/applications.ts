/**
 * Applications: the public submit path and the recruiter pipeline.
 *
 * The submit path is the one place in this system where a real person is
 * waiting and there is nothing to retry against if it half-succeeds, so it is a
 * single transaction over four writes: candidate, application, activity, Zoho
 * outbox. Either the recruiter sees a complete application or the candidate
 * sees an error and can try again. There is no state in between.
 */

import {
  db,
  isUuid,
  likePattern,
  lockForReference,
  ReferenceLock,
  tx,
  type Queryable,
} from "./client";
import {
  getCandidateById,
  upsertCandidateByEmail,
  type UpsertCandidateInput,
} from "./candidates";
import {
  enqueueZohoSync,
  insertActivity,
  listActivities,
  listNotes,
  type ActivityWithActor,
  type NoteWithAuthor,
} from "./crm";
import { allocateReferenceForSeries, getJobById, utcYear } from "./jobs";
import type {
  ApplicationRow,
  ApplicationStatus,
  CandidateRow,
  InterviewRow,
  JobRow,
  JobStatus,
} from "./types";

const APPLICATION_COLUMNS = `
  id, reference, job_id, candidate_id, status, resume_url, resume_filename,
  resume_size_bytes, relevant_experience, additional_info, source,
  assigned_recruiter_id, zoho_synced_at, applied_at, updated_at
`;

const INTERVIEW_COLUMNS = `
  id, application_id, kind, status, scheduled_at, completed_at,
  consulthire_interview_id, score, summary, created_at, updated_at
`;

// ------------------------------------------------------------------------ errors

export type SubmitApplicationErrorCode = "JOB_NOT_FOUND" | "JOB_NOT_PUBLISHED" | "NO_JOB_GIVEN";

/**
 * Typed so a route handler can map a cause to a status code and a message the
 * candidate can act on, instead of turning every refusal into a 500.
 */
export class SubmitApplicationError extends Error {
  readonly code: SubmitApplicationErrorCode;
  /** The job's actual status, when that is what caused the refusal. */
  readonly jobStatus?: JobStatus;

  constructor(code: SubmitApplicationErrorCode, message: string, jobStatus?: JobStatus) {
    super(message);
    this.name = "SubmitApplicationError";
    this.code = code;
    this.jobStatus = jobStatus;
  }
}

export class ApplicationNotFoundError extends Error {
  readonly code = "APPLICATION_NOT_FOUND" as const;

  constructor(readonly applicationId: string) {
    super(`No application with id ${applicationId}.`);
    this.name = "ApplicationNotFoundError";
  }
}

// ------------------------------------------------------------------------ submit

export interface SubmitApplicationInput {
  /** Either the job id or its slug. The slug is what a careers URL carries. */
  jobId?: string;
  jobSlug?: string;
  candidate: UpsertCandidateInput;
  /** Vercel Blob URL. The blob is private; the app issues access to it. */
  resumeUrl?: string | null;
  resumeFilename?: string | null;
  resumeSizeBytes?: number | null;
  relevantExperience?: string | null;
  additionalInfo?: string | null;
  /** Where the submission came from, for attribution. Defaults to "careers". */
  source?: string;
}

export interface SubmitApplicationResult {
  application: ApplicationRow;
  candidate: CandidateRow;
  /** false when this updated an existing application rather than creating one. */
  created: boolean;
}

/**
 * Accept an application.
 *
 * Order inside the transaction is chosen, not incidental:
 *
 *   1. Resolve and check the job. Refusing costs nothing if it happens first.
 *   2. Upsert the candidate. Done before the reference lock is taken so the
 *      lock is held for as little of the transaction as possible.
 *   3. Take the application reference lock, allocate the reference, insert.
 *   4. Log APPLIED and enqueue the CRM sync.
 *
 * Re-applying updates the existing row rather than creating a second one, via
 * the `(job_id, candidate_id)` unique index. The update deliberately does not
 * touch `status`, `assigned_recruiter_id`, `reference` or `applied_at`: if a
 * recruiter has already moved someone to INTERVIEW, a candidate re-uploading
 * their resume must not reset that work or change the code they were quoted.
 */
export async function submitApplication(
  input: SubmitApplicationInput,
): Promise<SubmitApplicationResult> {
  if (!input.jobId && !input.jobSlug) {
    throw new SubmitApplicationError(
      "NO_JOB_GIVEN",
      "submitApplication needs either jobId or jobSlug.",
    );
  }

  if (input.jobId && !isUuid(input.jobId)) {
    // A malformed id is a miss, not a crash. Comparing it against a uuid
    // column would raise invalid_text_representation inside the transaction.
    throw new SubmitApplicationError("JOB_NOT_FOUND", "That role does not exist.");
  }

  return tx(async (t) => {
    const [job] = await t.query<{ id: string; status: JobStatus; title: string }>(
      `SELECT id, status, title
         FROM jobs
        WHERE ($1::uuid IS NOT NULL AND id = $1::uuid)
           OR ($1::uuid IS NULL AND slug = $2::text)`,
      [input.jobId ?? null, input.jobSlug ?? null],
    );

    if (!job) {
      throw new SubmitApplicationError(
        "JOB_NOT_FOUND",
        "That role does not exist.",
      );
    }

    // The gate the task cares about: a draft, unpublished or archived role is
    // not open, and accepting against one would put an application into a
    // pipeline nobody is watching.
    if (job.status !== "PUBLISHED") {
      throw new SubmitApplicationError(
        "JOB_NOT_PUBLISHED",
        "That role is not currently accepting applications.",
        job.status,
      );
    }

    const { candidate } = await upsertCandidateByEmail(input.candidate, t);

    await lockForReference(t, ReferenceLock.APPLICATION);
    const reference = await allocateReferenceForSeries(
      t,
      "applications",
      `APP-${utcYear()}-`,
    );

    const rows = await t.query<ApplicationRow & { created: boolean }>(
      `INSERT INTO applications (
         reference, job_id, candidate_id, resume_url, resume_filename,
         resume_size_bytes, relevant_experience, additional_info, source
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'careers'))
       ON CONFLICT (job_id, candidate_id) DO UPDATE SET
         resume_url          = COALESCE(EXCLUDED.resume_url, applications.resume_url),
         resume_filename     = COALESCE(EXCLUDED.resume_filename, applications.resume_filename),
         resume_size_bytes   = COALESCE(EXCLUDED.resume_size_bytes, applications.resume_size_bytes),
         relevant_experience = COALESCE(EXCLUDED.relevant_experience, applications.relevant_experience),
         additional_info     = COALESCE(EXCLUDED.additional_info, applications.additional_info),
         updated_at          = NOW()
       RETURNING ${APPLICATION_COLUMNS}, (xmax = 0) AS created`,
      [
        reference,
        job.id,
        candidate.id,
        emptyToNull(input.resumeUrl),
        emptyToNull(input.resumeFilename),
        input.resumeSizeBytes ?? null,
        emptyToNull(input.relevantExperience),
        emptyToNull(input.additionalInfo),
        emptyToNull(input.source),
      ],
    );

    const row = rows[0];
    if (!row) {
      throw new Error("Upsert of applications returned no row.");
    }
    const { created, ...application } = row;

    // On the update path the reference allocated above is simply not used. It
    // leaves no gap in the series: the next allocation recomputes MAX + 1 from
    // what is actually stored, so the same number is handed out again.

    await insertActivity(t, {
      applicationId: application.id,
      // Null actor: the candidate did this, and candidates are not admin_users.
      actorId: null,
      kind: "APPLIED",
      detail: created
        ? `Applied to ${job.title}.`
        : `Re-submitted application for ${job.title}.`,
      toStatus: application.status,
    });

    // One queue row for the application, not two. The queue has no way to
    // express "do the candidate first", so a separate CANDIDATE job could be
    // picked up by a second worker out of order and create a duplicate Zoho
    // contact. The worker handling an APPLICATION row upserts the contact
    // itself, using candidates.zoho_contact_id to decide create or update.
    await enqueueZohoSync("APPLICATION", application.id, "UPSERT", t);

    return { application, candidate, created };
  });
}

// ------------------------------------------------------------------------- reads

/** A row of the recruiter's application list: the application plus its context. */
export interface ApplicationListItem extends ApplicationRow {
  candidate_email: string;
  candidate_first_name: string;
  candidate_last_name: string;
  job_title: string;
  job_reference: string;
  job_slug: string;
  assigned_recruiter_name: string | null;
}

export interface ListApplicationsFilters {
  status?: ApplicationStatus | "ALL";
  jobId?: string;
  /**
   * Free text, matched against the candidate's name and email, the application
   * reference, and the job's title and reference. Those are the five things a
   * recruiter actually has in hand when they go looking.
   */
  q?: string;
  assignedRecruiterId?: string;
  limit?: number;
  offset?: number;
}

export async function listApplications(
  filters: ListApplicationsFilters = {},
  runner: Queryable = db,
): Promise<ApplicationListItem[]> {
  const q = filters.q?.trim();
  const status = filters.status && filters.status !== "ALL" ? filters.status : null;

  return runner.query<ApplicationListItem>(
    `SELECT a.id, a.reference, a.job_id, a.candidate_id, a.status, a.resume_url,
            a.resume_filename, a.resume_size_bytes, a.relevant_experience,
            a.additional_info, a.source, a.assigned_recruiter_id, a.zoho_synced_at,
            a.applied_at, a.updated_at,
            c.email      AS candidate_email,
            c.first_name AS candidate_first_name,
            c.last_name  AS candidate_last_name,
            j.title      AS job_title,
            j.reference  AS job_reference,
            j.slug       AS job_slug,
            r.full_name  AS assigned_recruiter_name
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       JOIN jobs j       ON j.id = a.job_id
       LEFT JOIN admin_users r ON r.id = a.assigned_recruiter_id
      WHERE ($1::text IS NULL OR a.status = $1)
        AND ($2::uuid IS NULL OR a.job_id = $2)
        AND ($3::uuid IS NULL OR a.assigned_recruiter_id = $3)
        AND ($4::text IS NULL OR
             c.email ILIKE $4 OR c.first_name ILIKE $4 OR c.last_name ILIKE $4 OR
             (c.first_name || ' ' || c.last_name) ILIKE $4 OR
             a.reference ILIKE $4 OR j.title ILIKE $4 OR j.reference ILIKE $4)
      ORDER BY a.applied_at DESC
      LIMIT $5 OFFSET $6`,
    [
      status,
      filters.jobId ?? null,
      filters.assignedRecruiterId ?? null,
      q ? likePattern(q) : null,
      clampLimit(filters.limit, 50),
      Math.max(0, filters.offset ?? 0),
    ],
  );
}

export async function getApplicationById(
  id: string,
  runner: Queryable = db,
): Promise<ApplicationRow | null> {
  if (!isUuid(id)) {
    return null;
  }
  const rows = await runner.query<ApplicationRow>(
    `SELECT ${APPLICATION_COLUMNS} FROM applications WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Looked up by the code quoted in the candidate's confirmation email. */
export async function getApplicationByReference(
  reference: string,
  runner: Queryable = db,
): Promise<ApplicationRow | null> {
  const rows = await runner.query<ApplicationRow>(
    `SELECT ${APPLICATION_COLUMNS} FROM applications WHERE reference = $1`,
    [reference.trim()],
  );
  return rows[0] ?? null;
}

export interface ApplicationDetail {
  application: ApplicationRow;
  candidate: CandidateRow;
  job: JobRow;
  notes: NoteWithAuthor[];
  activities: ActivityWithActor[];
  interviews: InterviewRow[];
}

/**
 * Everything the application detail page renders.
 *
 * Five reads rather than one wide join: a join across notes, activities and
 * interviews would multiply rows together and have to be unpicked in
 * JavaScript. The four dependent reads run concurrently, so the latency is one
 * round trip for the application plus one for the rest.
 */
export async function getApplicationDetail(
  id: string,
  runner: Queryable = db,
): Promise<ApplicationDetail | null> {
  const application = await getApplicationById(id, runner);
  if (!application) {
    return null;
  }

  const [candidate, job, notes, activities, interviews] = await Promise.all([
    getCandidateById(application.candidate_id, runner),
    getJobById(application.job_id, runner),
    listNotes(id, runner),
    listActivities(id, runner),
    listInterviews(id, runner),
  ]);

  // Both are NOT NULL foreign keys, so a null here means the row vanished
  // between reads. Report it as "no detail" rather than inventing placeholders
  // the page would render as blanks.
  if (!candidate || !job) {
    return null;
  }

  return { application, candidate, job, notes, activities, interviews };
}

export async function listInterviews(
  applicationId: string,
  runner: Queryable = db,
): Promise<InterviewRow[]> {
  return runner.query<InterviewRow>(
    `SELECT ${INTERVIEW_COLUMNS}
       FROM interviews
      WHERE application_id = $1
      ORDER BY COALESCE(scheduled_at, created_at) DESC`,
    [applicationId],
  );
}

// ------------------------------------------------------------------------ writes

/**
 * Move an application through the pipeline.
 *
 * The current status is read `FOR UPDATE` first, inside the same transaction,
 * for two reasons: the activity row needs the real `from_status`, and two
 * recruiters clicking different stages at the same moment would otherwise both
 * log a transition from the same old value, leaving a timeline that does not
 * reconcile with the final state.
 *
 * A no-op transition writes nothing. "Changed status from INTERVIEW to
 * INTERVIEW" is noise in the one view that has to stay readable.
 */
export async function setApplicationStatus(
  id: string,
  status: ApplicationStatus,
  actorId: string | null,
): Promise<ApplicationRow> {
  if (!isUuid(id)) {
    throw new ApplicationNotFoundError(id);
  }

  return tx(async (t) => {
    const [current] = await t.query<{ status: ApplicationStatus }>(
      "SELECT status FROM applications WHERE id = $1 FOR UPDATE",
      [id],
    );

    if (!current) {
      throw new ApplicationNotFoundError(id);
    }

    if (current.status === status) {
      const unchanged = await getApplicationById(id, t);
      if (!unchanged) {
        throw new ApplicationNotFoundError(id);
      }
      return unchanged;
    }

    const rows = await t.query<ApplicationRow>(
      `UPDATE applications SET status = $2 WHERE id = $1 RETURNING ${APPLICATION_COLUMNS}`,
      [id, status],
    );

    const application = rows[0];
    if (!application) {
      throw new ApplicationNotFoundError(id);
    }

    await insertActivity(t, {
      applicationId: id,
      actorId,
      kind: "STATUS_CHANGED",
      fromStatus: current.status,
      toStatus: status,
    });

    // The CRM holds the same pipeline, so a stage change has to reach it. This
    // is the only producer of UPDATE_STATUS jobs, and it rides the same
    // transaction: a committed status change always has a queued sync.
    await enqueueZohoSync("APPLICATION", id, "UPDATE_STATUS", t);

    return application;
  });
}

/**
 * Assign or unassign the owning recruiter.
 *
 * `adminUserId` of null unassigns, which is a real action (someone leaves, or a
 * reassignment is undone) and gets its own timeline entry rather than silently
 * clearing the field.
 */
export async function assignRecruiter(
  id: string,
  adminUserId: string | null,
  actorId: string | null,
): Promise<ApplicationRow> {
  if (!isUuid(id)) {
    throw new ApplicationNotFoundError(id);
  }

  return tx(async (t) => {
    const rows = await t.query<ApplicationRow>(
      `UPDATE applications SET assigned_recruiter_id = $2
        WHERE id = $1
        RETURNING ${APPLICATION_COLUMNS}`,
      [id, adminUserId],
    );

    const application = rows[0];
    if (!application) {
      throw new ApplicationNotFoundError(id);
    }

    // Resolve the name inside the transaction so the timeline entry stays
    // readable after the admin account is deleted and actor_id goes null.
    let assigneeName: string | null = null;
    if (adminUserId) {
      const [assignee] = await t.query<{ full_name: string }>(
        "SELECT full_name FROM admin_users WHERE id = $1",
        [adminUserId],
      );
      assigneeName = assignee?.full_name ?? null;
    }

    await insertActivity(t, {
      applicationId: id,
      actorId,
      kind: "RECRUITER_ASSIGNED",
      detail: adminUserId
        ? `Assigned to ${assigneeName ?? adminUserId}.`
        : "Recruiter unassigned.",
    });

    return application;
  });
}

/**
 * Stamp the CRM sync time. Called by the sync worker after Zoho accepts the
 * application, so the admin view can show what has and has not landed.
 */
export async function markApplicationSynced(
  id: string,
  runner: Queryable = db,
): Promise<ApplicationRow | null> {
  const rows = await runner.query<ApplicationRow>(
    `UPDATE applications SET zoho_synced_at = NOW()
      WHERE id = $1
      RETURNING ${APPLICATION_COLUMNS}`,
    [id],
  );
  return rows[0] ?? null;
}

/** Counts per status, for the dashboard. Includes zero-count statuses. */
export async function countApplicationsByStatus(
  runner: Queryable = db,
): Promise<Record<ApplicationStatus, number>> {
  const rows = await runner.query<{ status: ApplicationStatus; count: number }>(
    "SELECT status, count(*)::int AS count FROM applications GROUP BY status",
  );

  const counts = {
    NEW: 0,
    SCREENING: 0,
    INTERVIEW: 0,
    SHORTLISTED: 0,
    OFFER: 0,
    HIRED: 0,
    REJECTED: 0,
    WITHDRAWN: 0,
  } satisfies Record<ApplicationStatus, number>;

  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
}

/**
 * Trim, and treat empty as absent.
 *
 * This is what makes a sparse re-application safe: the upsert above uses
 * COALESCE(EXCLUDED.x, existing), so a field the candidate left blank arrives
 * as NULL and keeps whatever was captured the first time, rather than
 * overwriting a resume URL with an empty string.
 */
function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function clampLimit(limit: number | undefined, fallback: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(limit), 200);
}
