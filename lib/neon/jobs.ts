/**
 * Job reads and writes.
 *
 * Two identifiers matter here and they are generated differently on purpose:
 *
 *   * `slug` is the public URL segment. Derived from the title, allocated once
 *     at create time and never touched again, so a link someone put on LinkedIn
 *     six months ago still resolves after the title is reworded.
 *   * `reference` is the human-quotable code, CA-2026-0001, sequential within
 *     the calendar year. See `allocateReference` for how concurrency is handled.
 */

import {
  db,
  FOREIGN_KEY_VIOLATION,
  isPgError,
  isUuid,
  likePattern,
  lockForReference,
  ReferenceLock,
  tx,
  type Queryable,
} from "./client";
import type { EmploymentType, JobRow, JobStatus, WorkplaceType } from "./types";

/** Thrown for input a database CHECK would reject, so callers get a 400 not a 500. */
export class JobInputError extends Error {
  readonly code: "EMPTY_TITLE" | "SALARY_RANGE_REVERSED";

  constructor(code: JobInputError["code"], message: string) {
    super(message);
    this.name = "JobInputError";
    this.code = code;
  }
}

export interface CreateJobInput {
  title: string;
  department: string;
  location: string;
  description: string;
  workplaceType?: WorkplaceType;
  employmentType?: EmploymentType;
  experienceLevel?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
  applicationDeadline?: Date | string | null;
  /** Defaults to DRAFT. Pass PUBLISHED to create and publish in one step. */
  status?: JobStatus;
}

/**
 * Edit payload. `slug` and `reference` are absent by design: both are
 * allocated at create time and are not editable through this layer.
 */
export type UpdateJobInput = Partial<Omit<CreateJobInput, "status">>;

const JOB_COLUMNS = `
  id, slug, reference, title, department, location, workplace_type, employment_type,
  experience_level, salary_min, salary_max, salary_currency, description,
  responsibilities, requirements, benefits, application_deadline, status,
  published_at, created_by, created_at, updated_at
`;

// ----------------------------------------------------------------------- reads

export interface ListJobsFilters {
  /** Free text, matched against title, reference, department and location. */
  q?: string;
  /** A single status, or "ALL" / omitted for every status. */
  status?: JobStatus | "ALL";
  limit?: number;
  offset?: number;
}

/**
 * Admin list. Returns every status unless filtered, newest first.
 *
 * The filters are applied as optional predicates rather than by assembling
 * different query strings, so there is exactly one statement to read and the
 * parameter positions are fixed.
 */
export async function listJobs(
  filters: ListJobsFilters = {},
  runner: Queryable = db,
): Promise<JobRow[]> {
  const q = filters.q?.trim();
  const status = filters.status && filters.status !== "ALL" ? filters.status : null;

  return runner.query<JobRow>(
    `SELECT ${JOB_COLUMNS}
       FROM jobs
      WHERE ($1::text IS NULL OR status = $1)
        AND ($2::text IS NULL OR
             title ILIKE $2 OR reference ILIKE $2 OR
             department ILIKE $2 OR location ILIKE $2)
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4`,
    [
      status,
      q ? likePattern(q) : null,
      clampLimit(filters.limit, 100),
      Math.max(0, filters.offset ?? 0),
    ],
  );
}

/**
 * The public /careers list.
 *
 * Status alone decides public visibility, matching the schema's own note, so an
 * expired `application_deadline` does not hide a role here. The careers page is
 * free to render "applications closed" from the deadline it already has.
 */
export async function listPublishedJobs(runner: Queryable = db): Promise<JobRow[]> {
  return runner.query<JobRow>(
    `SELECT ${JOB_COLUMNS}
       FROM jobs
      WHERE status = 'PUBLISHED'
      ORDER BY published_at DESC NULLS LAST, created_at DESC`,
  );
}

/**
 * Public lookup by URL segment.
 *
 * Returns the row at any status. Callers rendering a public page must check
 * `status === "PUBLISHED"` themselves; keeping that out of here means the admin
 * preview of an unpublished job can use the same function.
 */
export async function getJobBySlug(
  slug: string,
  runner: Queryable = db,
): Promise<JobRow | null> {
  const rows = await runner.query<JobRow>(
    `SELECT ${JOB_COLUMNS} FROM jobs WHERE slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function getJobById(
  id: string,
  runner: Queryable = db,
): Promise<JobRow | null> {
  if (!isUuid(id)) {
    return null;
  }
  const rows = await runner.query<JobRow>(
    `SELECT ${JOB_COLUMNS} FROM jobs WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------- writes

/**
 * Create a job, allocating its slug and reference.
 *
 * Runs in a transaction and takes a transaction-scoped advisory lock first, so
 * that allocating both identifiers is serialised against any other concurrent
 * create. See `allocateReference` for why that lock is the mechanism rather
 * than a retry loop.
 */
export async function createJob(
  input: CreateJobInput,
  adminUserId: string | null,
): Promise<JobRow> {
  const title = input.title.trim();
  if (title === "") {
    // An empty title slugifies to an empty string, which would take the one
    // slug every future empty-titled job also wants. Reject at the door.
    throw new JobInputError("EMPTY_TITLE", "A job needs a title.");
  }
  assertSalaryRange(input.salaryMin, input.salaryMax);

  const status: JobStatus = input.status ?? "DRAFT";

  return tx(async (t) => {
    await lockForReference(t, ReferenceLock.JOB);

    const slug = await allocateSlug(t, title);
    const reference = await allocateReference(t, "jobs", `CA-${utcYear()}-`);

    const rows = await t.query<JobRow>(
      `INSERT INTO jobs (
         slug, reference, title, department, location, workplace_type, employment_type,
         experience_level, salary_min, salary_max, salary_currency, description,
         responsibilities, requirements, benefits, application_deadline, status,
         published_at, created_by
       ) VALUES (
         $1, $2, $3, $4, $5, COALESCE($6, 'ONSITE'), COALESCE($7, 'FULL_TIME'),
         $8, $9, $10, COALESCE($11, 'USD'), $12,
         COALESCE($13::text[], '{}'), COALESCE($14::text[], '{}'), COALESCE($15::text[], '{}'),
         $16, $17,
         CASE WHEN $17 = 'PUBLISHED' THEN NOW() ELSE NULL END,
         $18
       )
       RETURNING ${JOB_COLUMNS}`,
      [
        slug,
        reference,
        title,
        input.department.trim(),
        input.location.trim(),
        input.workplaceType ?? null,
        input.employmentType ?? null,
        emptyToNull(input.experienceLevel),
        input.salaryMin ?? null,
        input.salaryMax ?? null,
        input.salaryCurrency ?? null,
        input.description,
        input.responsibilities ?? null,
        input.requirements ?? null,
        input.benefits ?? null,
        input.applicationDeadline ?? null,
        status,
        adminUserId,
      ],
    );

    // INSERT ... RETURNING always yields the row or throws, so this is a
    // type narrowing rather than a real branch.
    const job = rows[0];
    if (!job) {
      throw new Error("Insert of jobs returned no row.");
    }
    return job;
  });
}

/**
 * Column whitelist for `updateJob`.
 *
 * The SET list is built from this map, never from the keys of the incoming
 * object, so a hostile payload carrying `{"status": "PUBLISHED"}` or
 * `{"slug": "..."}` cannot reach the statement: those keys are simply not here.
 */
const UPDATABLE_COLUMNS = {
  title: "title",
  department: "department",
  location: "location",
  description: "description",
  workplaceType: "workplace_type",
  employmentType: "employment_type",
  experienceLevel: "experience_level",
  salaryMin: "salary_min",
  salaryMax: "salary_max",
  salaryCurrency: "salary_currency",
  responsibilities: "responsibilities",
  requirements: "requirements",
  benefits: "benefits",
  applicationDeadline: "application_deadline",
} as const satisfies Record<keyof UpdateJobInput, string>;

type UpdatableKey = keyof typeof UPDATABLE_COLUMNS;

/**
 * Apply an edit. The slug is never recomputed, even when the title changes:
 * a shared link must not rot.
 */
export async function updateJob(
  id: string,
  input: UpdateJobInput,
  runner: Queryable = db,
): Promise<JobRow> {
  if (!isUuid(id)) {
    throw new JobNotFoundError(id);
  }
  assertSalaryRange(input.salaryMin, input.salaryMax);

  const assignments: string[] = [];
  const params: unknown[] = [id];

  for (const key of Object.keys(UPDATABLE_COLUMNS) as UpdatableKey[]) {
    if (!(key in input)) {
      continue;
    }
    const value = input[key];
    if (value === undefined) {
      continue;
    }

    params.push(normaliseUpdateValue(key, value));
    // $1 is the id, so the first value lands at $2.
    assignments.push(`${UPDATABLE_COLUMNS[key]} = $${params.length}`);
  }

  if (assignments.length === 0) {
    // Nothing to change. Returning the current row keeps the caller's contract
    // (always a JobRow) without a pointless write and a bumped updated_at.
    const current = await getJobById(id, runner);
    if (!current) {
      throw new JobNotFoundError(id);
    }
    return current;
  }

  const rows = await runner.query<JobRow>(
    `UPDATE jobs SET ${assignments.join(", ")} WHERE id = $1 RETURNING ${JOB_COLUMNS}`,
    params,
  );

  const job = rows[0];
  if (!job) {
    throw new JobNotFoundError(id);
  }
  return job;
}

export class JobNotFoundError extends Error {
  readonly code = "JOB_NOT_FOUND" as const;

  constructor(readonly jobId: string) {
    super(`No job with id ${jobId}.`);
    this.name = "JobNotFoundError";
  }
}

/**
 * Move a job between statuses.
 *
 * `published_at` is stamped the first time the job reaches PUBLISHED and then
 * left alone, so unpublishing and republishing does not reorder /careers or
 * make the role look newly posted.
 */
export async function setJobStatus(
  id: string,
  status: JobStatus,
  runner: Queryable = db,
): Promise<JobRow> {
  if (!isUuid(id)) {
    throw new JobNotFoundError(id);
  }

  const rows = await runner.query<JobRow>(
    `UPDATE jobs
        SET status = $2,
            published_at = CASE
              WHEN $2 = 'PUBLISHED' AND published_at IS NULL THEN NOW()
              ELSE published_at
            END
      WHERE id = $1
      RETURNING ${JOB_COLUMNS}`,
    [id, status],
  );

  const job = rows[0];
  if (!job) {
    throw new JobNotFoundError(id);
  }
  return job;
}

/**
 * Delete a job, but only if nobody has applied to it.
 *
 * The FK from applications is ON DELETE RESTRICT, so the database would refuse
 * anyway; checking first lets the UI say "12 applications, archive it instead"
 * rather than surfacing a constraint name. The count and the delete share one
 * transaction so the number reported is the number that blocked it.
 */
export async function deleteJob(
  id: string,
): Promise<{ ok: boolean; blockedByApplications?: number }> {
  if (!isUuid(id)) {
    return { ok: false };
  }

  return tx(async (t) => {
    const [counted] = await t.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM applications WHERE job_id = $1",
      [id],
    );
    const blocking = counted?.count ?? 0;

    if (blocking > 0) {
      return { ok: false, blockedByApplications: blocking };
    }

    try {
      const deleted = await t.query<{ id: string }>(
        "DELETE FROM jobs WHERE id = $1 RETURNING id",
        [id],
      );

      // ok:false with no count means the job did not exist. Deleting something
      // already gone is reported as a miss rather than a success so the caller
      // can 404 instead of claiming it removed a row.
      return { ok: deleted.length > 0 };
    } catch (error) {
      if (!isPgError(error, FOREIGN_KEY_VIOLATION)) {
        throw error;
      }
      // An application was committed between the count and the delete, and
      // ON DELETE RESTRICT caught it. Re-count so the number reported is real.
      // This read has to happen outside the aborted transaction, hence `db`.
      const [recount] = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM applications WHERE job_id = $1",
        [id],
      );
      return { ok: false, blockedByApplications: recount?.count ?? 1 };
    }
  });
}

// ------------------------------------------------------------------- internals

/**
 * Title to URL segment: lowercase, every run of non-alphanumerics becomes one
 * hyphen, no leading or trailing hyphen.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    // Strip combining marks so "Resume Analyst" spelled with accents keeps its
    // letters instead of losing them to the non-alphanumeric rule below.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Pick a free slug: the base if available, else base-2, base-3, ...
 *
 * Reads every sibling in one statement rather than probing in a loop, and runs
 * under the caller's advisory lock so two simultaneous creates of the same
 * title cannot both decide on base-2.
 */
async function allocateSlug(t: Queryable, title: string): Promise<string> {
  const base = slugify(title) || "role";

  // `base` is [a-z0-9-] by construction, so it cannot contain a LIKE wildcard.
  const siblings = await t.query<{ slug: string }>(
    "SELECT slug FROM jobs WHERE slug = $1 OR slug LIKE $1 || '-%'",
    [base],
  );

  const taken = new Set(siblings.map((row) => row.slug));
  if (!taken.has(base)) {
    return base;
  }

  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/**
 * Allocate the next reference in a prefixed series, e.g. CA-2026-0001.
 *
 * How this is made concurrency-safe, since it is the obvious place to get it
 * wrong: the next number is `MAX(existing) + 1` computed inside the database,
 * which on its own is a classic race under READ COMMITTED. Two transactions
 * take the same snapshot, both compute 0007, and one of them has to lose. So
 * callers take `pg_advisory_xact_lock` for the series before calling this,
 * which serialises allocation and makes the sequence gapless. The UNIQUE index
 * on the column stays as the backstop: if a seed script or a future code path
 * ever inserts a reference without taking the lock, the insert fails loudly
 * instead of producing two jobs quoting the same code to candidates.
 *
 * A Postgres sequence was the alternative. Rejected because "sequential per
 * year" would need a new sequence created every January, sequences are not
 * transactional (a rolled-back create would burn a number and leave a visible
 * gap in something customers quote back to us), and resetting one is a manual
 * DDL step. The advisory lock keeps the rule in one readable place.
 *
 * `table` is a fixed identifier chosen by this module, never caller input.
 */
async function allocateReference(
  t: Queryable,
  table: "jobs" | "applications",
  prefix: string,
): Promise<string> {
  const [row] = await t.query<{ reference: string }>(
    `WITH taken AS (
       SELECT substring(reference, length($1::text) + 1) AS tail
         FROM ${table}
        WHERE reference LIKE $1 || '%'
     ),
     next_number AS (
       SELECT COALESCE(MAX(tail::int), 0) + 1 AS n
         FROM taken
        WHERE tail ~ '^[0-9]+$'
     )
     SELECT $1 || lpad(n::text, GREATEST(4, length(n::text)), '0') AS reference
       FROM next_number`,
    [prefix],
  );

  if (!row) {
    throw new Error(`Could not allocate a ${table} reference for prefix ${prefix}.`);
  }
  return row.reference;
}

/**
 * Exposed so applications.ts can allocate its own series without duplicating
 * the concurrency reasoning above.
 */
export { allocateReference as allocateReferenceForSeries };

/** Calendar year of the reference series, in UTC so it never depends on the server's locale. */
export function utcYear(now: Date = new Date()): number {
  return now.getUTCFullYear();
}

function assertSalaryRange(min: number | null | undefined, max: number | null | undefined): void {
  if (typeof min === "number" && typeof max === "number" && min > max) {
    // jobs_salary_range_ck would reject this too, but a CHECK violation reaches
    // the caller as an unlabelled 500.
    throw new JobInputError(
      "SALARY_RANGE_REVERSED",
      "Minimum salary cannot exceed maximum salary.",
    );
  }
}

/**
 * Trim text, and treat an empty result as NULL.
 *
 * An empty string in a nullable column is a third state nothing checks for:
 * `experience_level = ''` renders as a blank label on the careers page where
 * NULL renders as nothing at all.
 */
function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normaliseUpdateValue(key: UpdatableKey, value: unknown): unknown {
  switch (key) {
    // NOT NULL columns: trim, but never turn into NULL.
    case "title":
    case "department":
    case "location":
      return typeof value === "string" ? value.trim() : value;
    case "experienceLevel":
      return emptyToNull(value as string | null);
    default:
      return value;
  }
}

/** Keep page sizes bounded so a crafted `limit` cannot ask for the whole table. */
function clampLimit(limit: number | undefined, fallback: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(limit), 200);
}
