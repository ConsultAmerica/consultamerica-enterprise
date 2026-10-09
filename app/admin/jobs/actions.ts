"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, type AdminSessionUser } from "@/lib/neon/auth";
import { NeonConfigError } from "@/lib/neon/client";
import {
  createJob,
  deleteJob,
  JobInputError,
  JobNotFoundError,
  setJobStatus,
  updateJob,
} from "@/lib/neon/jobs";
import {
  EMPLOYMENT_TYPES,
  WORKPLACE_TYPES,
  type EmploymentType,
  type JobStatus,
  type WorkplaceType,
} from "@/lib/neon/types";
import { logServerError } from "@/lib/observability/logger";

/**
 * Manual job management for the Neon-backed admin area: create, edit, publish,
 * unpublish, archive, delete. Nothing is imported from anywhere — an admin
 * types a job in and publishes it.
 *
 * Three rules shape every function here.
 *
 * 1. Server Actions are reachable by direct POST, not only through the form
 *    that rendered them, so authorization is re-checked inside each one rather
 *    than inherited from the page. requireAdmin() is the first statement of
 *    every entry point.
 *
 * 2. Nothing throws. Production redacts thrown Server Action messages to an
 *    opaque digest, and Postgres detail (constraint names, SQLSTATE) must never
 *    reach a browser anyway. Failures come back as { ok: false, error } with a
 *    sentence an admin can act on, and the technical cause is logged under
 *    `admin-jobs/*`.
 *
 * 3. Input is validated here as well as in the browser. The client-side checks
 *    are a courtesy; these are the ones that hold, because the form is not the
 *    only possible caller.
 */

export type JobActionResult =
  | { ok: true; id: string; slug?: string }
  | { ok: false; error: string };

// ------------------------------------------------------------- user-facing copy

/**
 * requireAdmin() answers an unauthenticated call with redirect(), which is a
 * throw. Converting it into a message rather than letting it propagate keeps
 * the "nothing throws" contract above: the caller is a client component that
 * renders `result.error` inline, and its next router.refresh() lands on a page
 * whose own requireAdmin() does the real redirect to the sign-in form.
 */
const SIGNED_OUT = "Your admin session has ended. Sign in again, then retry.";
const NOT_CONFIGURED =
  "The recruitment database is not configured (DATABASE_URL is unset), so nothing can be saved.";
const GENERIC = "Something went wrong. Please try again.";
const MISSING = "That job no longer exists.";
const NO_ID = "Missing job reference.";

/**
 * Caps, applied by truncation rather than rejection: a pasted description that
 * runs long should save as much as is useful, not throw the admin's work away.
 * `lines` bounds the list fields so a pasted document cannot become a
 * thousand-element array.
 */
const LIMITS = {
  title: 200,
  short: 120,
  description: 12_000,
  line: 400,
  lines: 60,
  money: 20,
} as const;

// -------------------------------------------------------------------- the guard

type Authorized = { ok: true; admin: AdminSessionUser } | { ok: false; error: string };

/**
 * True for the control-flow "errors" Next.js throws from redirect() and
 * notFound(). They carry a `digest` string rather than being a nominal type, so
 * this is the only way to recognise one without importing an internal.
 */
function isFrameworkSignal(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

async function authorize(event: string): Promise<Authorized> {
  try {
    return { ok: true, admin: await requireAdmin() };
  } catch (error) {
    if (isFrameworkSignal(error)) return { ok: false, error: SIGNED_OUT };
    if (error instanceof NeonConfigError) return { ok: false, error: NOT_CONFIGURED };
    // Anything else here is the session lookup itself failing, e.g. Neon
    // unreachable. Fail closed: no write happens.
    logServerError(`admin-jobs/${event}`, error, { stage: "authorize" });
    return { ok: false, error: GENERIC };
  }
}

/**
 * The single place a thrown write becomes a message. JobInputError carries copy
 * that was written for an admin to read, so it is passed through verbatim;
 * everything else is reduced to a generic sentence and logged.
 */
function failure(event: string, jobId: string, error: unknown): { ok: false; error: string } {
  if (error instanceof JobInputError) return { ok: false, error: error.message };
  if (error instanceof JobNotFoundError) return { ok: false, error: MISSING };
  if (error instanceof NeonConfigError) return { ok: false, error: NOT_CONFIGURED };
  logServerError(`admin-jobs/${event}`, error, { jobId });
  return { ok: false, error: GENERIC };
}

/**
 * Everything that must reflect a job change immediately.
 *
 * /careers and /jobs are listed because they are the public surfaces a publish
 * or unpublish changes; both are still served from the older data layer today,
 * so these two calls are no-ops for now and become correct the moment those
 * pages read Neon. /admin/jobs and the job's own two admin pages are the views
 * the acting admin is looking at.
 */
function revalidateJobPaths(id?: string, slug?: string): void {
  revalidatePath("/admin/jobs");
  revalidatePath("/careers");
  revalidatePath("/jobs");
  if (id) {
    revalidatePath(`/admin/jobs/${id}`);
    revalidatePath(`/admin/jobs/${id}/edit`);
  }
  if (slug) revalidatePath(`/jobs/${slug}`);
}

// ------------------------------------------------------------------ form parsing

function text(form: FormData, name: string, max: number): string {
  return String(form.get(name) ?? "")
    .trim()
    .slice(0, max);
}

/**
 * Multi-line fields (responsibilities, requirements, benefits) arrive as one
 * textarea string. One item per line, trimmed, blank lines dropped — so the
 * blank line an admin leaves between two bullets is formatting, not an empty
 * bullet on the careers page.
 */
function lines(form: FormData, name: string): string[] {
  return String(form.get(name) ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(0, LIMITS.lines)
    .map((line) => line.slice(0, LIMITS.line));
}

/**
 * A checkbox that was not ticked is absent from the FormData entirely, so
 * "missing" and "off" are the same answer: false.
 */
function checked(form: FormData, name: string): boolean {
  const raw = String(form.get(name) ?? "").toLowerCase();
  return raw === "on" || raw === "true" || raw === "1" || raw === "yes";
}

type MoneyResult = { ok: true; value: number | null } | { ok: false };

/**
 * Blank means "not stated", which is NULL — not zero. A zero minimum salary is
 * a real, publishable claim about pay, so it must not be what an empty field
 * turns into. Unparseable input is reported rather than silently dropped: an
 * admin who typed a figure deserves to know it was not saved.
 */
function money(form: FormData, name: string): MoneyResult {
  const raw = text(form, name, LIMITS.money).replace(/[$,\s]/g, "");
  if (raw === "") return { ok: true, value: null };
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return { ok: false };
  return { ok: true, value: Math.round(parsed) };
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** The shape both createJob and updateJob accept, once the form is trusted. */
type ParsedJob = {
  title: string;
  department: string;
  location: string;
  description: string;
  workplaceType: WorkplaceType;
  employmentType: EmploymentType;
  experienceLevel: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  applicationDeadline: string | null;
};

function parseJobForm(
  form: FormData,
): { ok: true; job: ParsedJob } | { ok: false; error: string } {
  const title = text(form, "title", LIMITS.title);
  const department = text(form, "department", LIMITS.short);
  const location = text(form, "location", LIMITS.short);
  const description = text(form, "description", LIMITS.description);

  // title, department, location and description are NOT NULL in db/neon/001_init.sql.
  // An empty string would satisfy the column and then render as a blank line on
  // the careers page, so they are required here rather than at the database.
  if (!title) return { ok: false, error: "Job title is required." };
  if (!department) return { ok: false, error: "Department is required." };
  if (!location) return { ok: false, error: "Location is required." };
  if (!description) return { ok: false, error: "A role description is required." };

  const min = money(form, "salaryMin");
  const max = money(form, "salaryMax");
  if (!min.ok || !max.ok) {
    return { ok: false, error: "Enter whole numbers for the salary range, or leave both blank." };
  }
  // jobs_salary_range_ck rejects a reversed range, and a CHECK violation would
  // reach the browser as an unlabelled failure. Caught here so the admin is
  // told which field to fix. lib/neon/jobs.ts asserts the same rule again.
  if (min.value !== null && max.value !== null && min.value > max.value) {
    return { ok: false, error: "Minimum salary cannot be above the maximum." };
  }

  const currency = text(form, "salaryCurrency", 3).toUpperCase() || "USD";
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, error: "Use a three-letter currency code, for example USD." };
  }

  const deadline = text(form, "applicationDeadline", 10);
  let applicationDeadline: string | null = null;
  if (deadline) {
    // End of the chosen day in UTC, so a role stays open for the whole of its
    // closing date instead of shutting at midnight as that day begins.
    const instant = `${deadline}T23:59:59.000Z`;
    const parsed = new Date(instant);
    // Date() happily rolls 2026-02-31 forward to 3 March, so the round trip is
    // the only honest test that the day actually exists.
    if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(deadline)) {
      return { ok: false, error: "Enter a real closing date, or leave it blank." };
    }
    applicationDeadline = instant;
  }

  return {
    ok: true,
    job: {
      title,
      department,
      location,
      description,
      workplaceType: oneOf(text(form, "workplaceType", 20), WORKPLACE_TYPES, "ONSITE"),
      employmentType: oneOf(text(form, "employmentType", 20), EMPLOYMENT_TYPES, "FULL_TIME"),
      // "" would be a third state nothing checks for; NULL is "not stated".
      experienceLevel: text(form, "experienceLevel", LIMITS.short) || null,
      salaryMin: min.value,
      salaryMax: max.value,
      salaryCurrency: currency,
      responsibilities: lines(form, "responsibilities"),
      requirements: lines(form, "requirements"),
      benefits: lines(form, "benefits"),
      applicationDeadline,
    },
  };
}

// ----------------------------------------------------------------------- writes

export async function createJobAction(formData: FormData): Promise<JobActionResult> {
  const auth = await authorize("create");
  if (!auth.ok) return auth;

  const parsed = parseJobForm(formData);
  if (!parsed.ok) return parsed;

  // publishNow exists on the create form only, and is unchecked by default:
  // a draft is the safe outcome of a mis-click, a live public posting is not.
  // Editing a job never changes its status — that is what the publish and
  // unpublish actions below are for.
  const status: JobStatus = checked(formData, "publishNow") ? "PUBLISHED" : "DRAFT";

  try {
    const job = await createJob({ ...parsed.job, status }, auth.admin.id);
    revalidateJobPaths(job.id, job.slug);
    return { ok: true, id: job.id, slug: job.slug };
  } catch (error) {
    return failure("create", "new", error);
  }
}

export async function updateJobAction(formData: FormData): Promise<JobActionResult> {
  const auth = await authorize("update");
  if (!auth.ok) return auth;

  // 64 rather than 36: a malformed id should reach updateJob and come back as
  // "no longer exists", not be silently truncated into a different uuid.
  const id = text(formData, "id", 64);
  if (!id) return { ok: false, error: NO_ID };

  const parsed = parseJobForm(formData);
  if (!parsed.ok) return parsed;

  try {
    // Every field is sent on every save, so this is a full overwrite of the
    // editable columns. slug and reference are not among them by design: a link
    // someone shared must not rot because the title was reworded.
    const job = await updateJob(id, parsed.job);
    revalidateJobPaths(job.id, job.slug);
    return { ok: true, id: job.id, slug: job.slug };
  } catch (error) {
    return failure("update", id, error);
  }
}

/**
 * The one status path. PUBLISHED is the only publicly visible state; DRAFT,
 * UNPUBLISHED and ARCHIVED all keep the job off the careers page.
 */
async function moveStatus(id: string, status: JobStatus, event: string): Promise<JobActionResult> {
  const auth = await authorize(event);
  if (!auth.ok) return auth;
  if (!id) return { ok: false, error: NO_ID };

  try {
    const job = await setJobStatus(id, status);
    revalidateJobPaths(job.id, job.slug);
    return { ok: true, id: job.id, slug: job.slug };
  } catch (error) {
    return failure(event, id, error);
  }
}

export async function publishJobAction(id: string): Promise<JobActionResult> {
  return moveStatus(id, "PUBLISHED", "publish");
}

export async function unpublishJobAction(id: string): Promise<JobActionResult> {
  return moveStatus(id, "UNPUBLISHED", "unpublish");
}

export async function archiveJobAction(id: string): Promise<JobActionResult> {
  return moveStatus(id, "ARCHIVED", "archive");
}

/**
 * Hard delete, and only for a job nobody has applied to.
 *
 * applications.job_id is ON DELETE RESTRICT, so the database refuses this
 * anyway; deleteJob counts first so the refusal can name the number of real
 * people whose submissions would have been orphaned, and point at archiving,
 * which keeps every record and still clears the careers page.
 */
export async function deleteJobAction(id: string): Promise<JobActionResult> {
  const auth = await authorize("delete");
  if (!auth.ok) return auth;
  if (!id) return { ok: false, error: NO_ID };

  try {
    const result = await deleteJob(id);
    if (!result.ok) {
      const blocking = result.blockedByApplications ?? 0;
      if (blocking > 0) {
        return {
          ok: false,
          error:
            `This job has ${blocking} application${blocking === 1 ? "" : "s"} attached and cannot be deleted. ` +
            "Archive it instead: archiving takes it off the careers page and keeps every candidate record.",
        };
      }
      // ok:false with no count means the row was already gone.
      return { ok: false, error: MISSING };
    }
    revalidateJobPaths(id);
    return { ok: true, id };
  } catch (error) {
    return failure("delete", id, error);
  }
}
