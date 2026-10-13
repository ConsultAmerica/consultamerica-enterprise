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
  type ActivityWithActor,
} from "./crm";
import { allocateReferenceForSeries, getJobById, utcYear } from "./jobs";
import type {
  ApplicationMethod,
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
  assigned_recruiter_id, zoho_synced_at, applied_at, updated_at, method
`;

const INTERVIEW_COLUMNS = `
  id, application_id, kind, status, scheduled_at, completed_at,
  consulthire_interview_id, score, summary, created_at, updated_at,
  report, verdict, transcript_url, second_round_sent_at, launched_at
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
  /**
   * How they applied. Defaults to EASY_APPLY, which is what every caller that
   * predates the AI route means and what the column already defaults to.
   */
  method?: ApplicationMethod;
  /**
   * Also create the AI_SCREEN interview row, inside the same transaction.
   *
   * WHY IT IS PART OF THE SUBMIT AND NOT A SECOND CALL. The candidate is about
   * to be sent to ConsultHire, and the completion webhook that carries their
   * score needs a row to land on. A separate insert afterwards can fail on its
   * own, and then the interview runs against a record that does not exist and
   * the result has nowhere to go: a candidate sits a twenty-minute interview
   * and the recruiter never sees a score. One transaction means the application
   * and the row that will hold its result are the same commit.
   */
  withAiScreen?: boolean;
}

export interface SubmitApplicationResult {
  application: ApplicationRow;
  candidate: CandidateRow;
  /** false when this updated an existing application rather than creating one. */
  created: boolean;
  /** Present only when `withAiScreen` was asked for. */
  interview?: InterviewRow;
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
 *   4. Create the AI_SCREEN interview row, when one was asked for. After the
 *      application, because it is a child of it; before the response, because
 *      the candidate is about to be sent to ConsultHire and the result has to
 *      have somewhere to land.
 *   5. Log APPLIED and enqueue the CRM sync.
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
         resume_size_bytes, relevant_experience, additional_info, source, method
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'careers'), COALESCE($10, 'EASY_APPLY'))
       ON CONFLICT (job_id, candidate_id) DO UPDATE SET
         resume_url          = COALESCE(EXCLUDED.resume_url, applications.resume_url),
         resume_filename     = COALESCE(EXCLUDED.resume_filename, applications.resume_filename),
         resume_size_bytes   = COALESCE(EXCLUDED.resume_size_bytes, applications.resume_size_bytes),
         relevant_experience = COALESCE(EXCLUDED.relevant_experience, applications.relevant_experience),
         additional_info     = COALESCE(EXCLUDED.additional_info, applications.additional_info),
         -- METHOD ONLY EVER RATCHETS UP, NEVER BACK.
         --
         -- The naive EXCLUDED.method is wrong in one direction. Somebody who
         -- sat the AI interview and later submitted the Easy Apply form for
         -- the same role would have their application relabelled "Form" while
         -- the interview row, the score and the report all stayed attached to
         -- it: the dashboard would then hide an AI score behind a Form badge
         -- and the method filter would never find it. Sitting an interview is
         -- a fact about this application that filling in a form afterwards
         -- does not undo.
         method              = CASE
                                 WHEN EXCLUDED.method = 'AI_INTERVIEW' THEN 'AI_INTERVIEW'
                                 ELSE applications.method
                               END,
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
        input.method ?? null,
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

    /*
      The AI interview row, before the candidate is ever sent anywhere.

      Upserted, not inserted. interviews_application_ai_uidx is a UNIQUE index
      on (application_id) WHERE kind = 'AI_SCREEN', so a candidate who comes
      back through the apply flow a second time resumes one interview instead
      of acquiring a second scored attempt with no way to say which result is
      the real one. The ON CONFLICT names the index predicate because Postgres
      will not infer a partial index without it.

      The UPDATE branch touches launched_at and nothing else. Overwriting
      status would reopen an interview that has already been scored, and
      overwriting the score or the report would destroy a finished result
      because somebody clicked the apply button again.
    */
    let interview: InterviewRow | undefined;
    if (input.withAiScreen) {
      const interviewRows = await t.query<InterviewRow>(
        `INSERT INTO interviews (application_id, kind, status, launched_at)
         VALUES ($1, 'AI_SCREEN', 'INVITED', NOW())
         ON CONFLICT (application_id) WHERE kind = 'AI_SCREEN'
         DO UPDATE SET launched_at = NOW()
         RETURNING ${INTERVIEW_COLUMNS}`,
        [application.id],
      );
      interview = interviewRows[0];
      if (!interview) {
        throw new Error("Upsert of interviews returned no row.");
      }
    }

    await insertActivity(t, {
      applicationId: application.id,
      // Null actor: the candidate did this, and candidates are not admin_users.
      actorId: null,
      kind: "APPLIED",
      // The timeline says which route was taken, because "applied" and "sat an
      // AI interview" are different things to read six weeks later.
      detail: input.withAiScreen
        ? created
          ? `Applied to ${job.title} and started an AI interview.`
          : `Relaunched the AI interview for ${job.title}.`
        : created
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

    return { application, candidate, created, interview };
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
  /**
   * The AI interview, flattened onto the row.
   *
   * NUMERIC, so a string — see the note at the top of lib/neon/types.ts. Null
   * for a form applicant, and also for an AI applicant who was invited and
   * never finished, which the queue renders differently from "never invited".
   */
  interview_score: string | null;
  interview_status: InterviewRow["status"] | null;
  interview_verdict: string | null;
}

export interface ListApplicationsFilters {
  status?: ApplicationStatus | "ALL";
  /** A single method, or "ALL" / omitted for both. */
  method?: ApplicationMethod | "ALL";
  jobId?: string;
  /**
   * Free text, matched against the candidate's name and email, the application
   * reference, and the job's title and reference. Those are the five things a
   * recruiter actually has in hand when they go looking.
   */
  q?: string;
  assignedRecruiterId?: string;
  /**
   * Which column to order by. A key, never a fragment of SQL: the value
   * arrives from a query string and is mapped through APPLICATION_SORTS below,
   * so an unknown key falls back to the default instead of reaching Postgres.
   */
  sort?: ApplicationSort;
  /** Ascending or descending. Anything else is treated as the default. */
  dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** The columns a recruiter may order the queue by. */
export type ApplicationSort = "applied" | "candidate" | "role" | "stage";

/**
 * Sort keys mapped to ORDER BY fragments.
 *
 * A FIXED LOOKUP, NOT STRING INTERPOLATION. Column names cannot be
 * parameterised in Postgres, so the only safe way to make ORDER BY dynamic is
 * to never let user input become SQL: the query string selects a key, this
 * object owns the text, and a key that is not here cannot produce a query.
 *
 * Every fragment ends with a tiebreak on applied_at so paging is stable.
 * Without it, two applications with the same stage can swap places between
 * requests and a recruiter paging through sees one twice and another never.
 *
 * `stage` orders by the pipeline, not alphabetically: sorting hiring stages
 * A-to-Z puts Hired before Interview before New, which is meaningless. The
 * CASE spells out the real order.
 */
const APPLICATION_SORTS: Record<ApplicationSort, { asc: string; desc: string }> = {
  applied: {
    asc: "a.applied_at ASC",
    desc: "a.applied_at DESC",
  },
  candidate: {
    asc: "lower(c.first_name || ' ' || c.last_name) ASC, a.applied_at DESC",
    desc: "lower(c.first_name || ' ' || c.last_name) DESC, a.applied_at DESC",
  },
  role: {
    asc: "lower(j.title) ASC, a.applied_at DESC",
    desc: "lower(j.title) DESC, a.applied_at DESC",
  },
  stage: {
    asc: "stage_rank ASC, a.applied_at DESC",
    desc: "stage_rank DESC, a.applied_at DESC",
  },
};

/** The pipeline order, as a sortable integer. Mirrors PIPELINE in the admin UI. */
const STAGE_RANK_SQL = `CASE a.status
        WHEN 'NEW' THEN 1
        WHEN 'SCREENING' THEN 2
        WHEN 'INTERVIEW' THEN 3
        WHEN 'SHORTLISTED' THEN 4
        WHEN 'OFFER' THEN 5
        WHEN 'HIRED' THEN 6
        WHEN 'REJECTED' THEN 7
        WHEN 'WITHDRAWN' THEN 8
        ELSE 9
      END`;

/** The ORDER BY text for a (possibly unknown) sort key and direction. */
export function applicationOrderBy(sort?: string, dir?: string): string {
  const key = (sort ?? "") as ApplicationSort;
  const entry = APPLICATION_SORTS[key] ?? APPLICATION_SORTS.applied;
  return dir === "asc" ? entry.asc : entry.desc;
}

export async function listApplications(
  filters: ListApplicationsFilters = {},
  runner: Queryable = db,
): Promise<ApplicationListItem[]> {
  const q = filters.q?.trim();
  const status = filters.status && filters.status !== "ALL" ? filters.status : null;
  const method = filters.method && filters.method !== "ALL" ? filters.method : null;

  return runner.query<ApplicationListItem>(
    `SELECT a.id, a.reference, a.job_id, a.candidate_id, a.status, a.resume_url,
            a.resume_filename, a.resume_size_bytes, a.relevant_experience,
            a.additional_info, a.source, a.assigned_recruiter_id, a.zoho_synced_at,
            a.applied_at, a.updated_at, a.method,
            c.email      AS candidate_email,
            c.first_name AS candidate_first_name,
            c.last_name  AS candidate_last_name,
            j.title      AS job_title,
            j.reference  AS job_reference,
            j.slug       AS job_slug,
            r.full_name  AS assigned_recruiter_name,
            i.score      AS interview_score,
            i.status     AS interview_status,
            i.verdict    AS interview_verdict,
            ${STAGE_RANK_SQL} AS stage_rank
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       JOIN jobs j       ON j.id = a.job_id
       LEFT JOIN admin_users r ON r.id = a.assigned_recruiter_id
       /*
         A JOIN, NOT A SUBSELECT PER ROW, and it cannot multiply the result:
         interviews_application_ai_uidx is UNIQUE on (application_id) WHERE
         kind = 'AI_SCREEN', so there is at most one matching row by
         construction. That is what lets the AI score ride along on the read
         that was already happening instead of costing a query per row, and it
         is why the existing sorting and paging stay exactly as they were.
       */
       LEFT JOIN interviews i ON i.application_id = a.id AND i.kind = 'AI_SCREEN'
      WHERE ($1::text IS NULL OR a.status = $1)
        AND ($2::uuid IS NULL OR a.job_id = $2)
        AND ($3::uuid IS NULL OR a.assigned_recruiter_id = $3)
        AND ($4::text IS NULL OR
             c.email ILIKE $4 OR c.first_name ILIKE $4 OR c.last_name ILIKE $4 OR
             (c.first_name || ' ' || c.last_name) ILIKE $4 OR
             a.reference ILIKE $4 OR j.title ILIKE $4 OR j.reference ILIKE $4)
        AND ($5::text IS NULL OR a.method = $5)
      ORDER BY ${applicationOrderBy(filters.sort, filters.dir)}
      LIMIT $6 OFFSET $7`,
    [
      status,
      filters.jobId ?? null,
      filters.assignedRecruiterId ?? null,
      q ? likePattern(q) : null,
      method,
      clampLimit(filters.limit, 50),
      Math.max(0, filters.offset ?? 0),
    ],
  );
}

/**
 * Counts per application method, for the queue's filter labels.
 *
 * Both keys are always present, including at zero: a dropdown that silently
 * drops "AI Bot (0)" would make the filter look unavailable rather than empty.
 */
export async function countApplicationsByMethod(
  runner: Queryable = db,
): Promise<Record<ApplicationMethod, number>> {
  const rows = await runner.query<{ method: ApplicationMethod; count: number }>(
    "SELECT method, count(*)::int AS count FROM applications GROUP BY method",
  );

  const counts = { EASY_APPLY: 0, AI_INTERVIEW: 0 } satisfies Record<
    ApplicationMethod,
    number
  >;
  for (const row of rows) {
    // Guarded rather than assigned blindly: `method` is TEXT with a CHECK, and
    // widening that CHECK (lib/neon/types.ts says to expect it) must not add a
    // key this object's type says cannot exist.
    if (row.method in counts) counts[row.method] = row.count;
  }
  return counts;
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
  activities: ActivityWithActor[];
  interviews: InterviewRow[];
}

/**
 * Everything the application detail page renders.
 *
 * Four reads rather than one wide join: a join across activities and
 * interviews would multiply rows together and have to be unpicked in
 * JavaScript. The three dependent reads run concurrently, so the latency is
 * one round trip for the application plus one for the rest.
 */
export async function getApplicationDetail(
  id: string,
  runner: Queryable = db,
): Promise<ApplicationDetail | null> {
  const application = await getApplicationById(id, runner);
  if (!application) {
    return null;
  }

  const [candidate, job, activities, interviews] = await Promise.all([
    getCandidateById(application.candidate_id, runner),
    getJobById(application.job_id, runner),
    listActivities(id, runner),
    listInterviews(id, runner),
  ]);

  // Both are NOT NULL foreign keys, so a null here means the row vanished
  // between reads. Report it as "no detail" rather than inventing placeholders
  // the page would render as blanks.
  if (!candidate || !job) {
    return null;
  }

  return { application, candidate, job, activities, interviews };
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

/**
 * Delete one application outright.
 *
 * WHAT GOES WITH IT. application_activities.application_id and
 * interviews.application_id are both ON DELETE CASCADE, so the timeline and
 * any AI interview record for this application are destroyed in the same
 * statement. That is the correct shape: an activity trail about a row that no
 * longer exists is not an audit trail, it is litter. It is also why this is
 * irreversible and why the caller puts a second click in front of it.
 *
 * WHAT DOES NOT GO WITH IT. The résumé is a file in Vercel Blob, and Postgres
 * knows nothing about it. The stored URL is returned so the caller can delete
 * the blob too; without that, every deleted application leaves a candidate's CV
 * sitting in the bucket with nothing pointing at it.
 *
 * THE CANDIDATE RECORD SURVIVES. A person can hold several applications and
 * deleting one of them is not a statement about the person. Removing a
 * candidate is a separate decision with a separate control.
 *
 * Returns null when there was no such row, so the caller can report a miss
 * rather than claiming to have deleted something.
 */
export async function deleteApplication(
  id: string,
): Promise<{ reference: string; resumeUrl: string | null; candidateId: string } | null> {
  if (!isUuid(id)) {
    return null;
  }

  const rows = await db.query<{
    reference: string;
    resume_url: string | null;
    candidate_id: string;
  }>(
    `DELETE FROM applications WHERE id = $1
     RETURNING reference, resume_url, candidate_id`,
    [id],
  );

  const row = rows[0];
  return row
    ? { reference: row.reference, resumeUrl: row.resume_url, candidateId: row.candidate_id }
    : null;
}
