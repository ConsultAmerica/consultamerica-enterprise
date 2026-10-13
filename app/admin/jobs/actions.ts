"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { consultHireConfig } from "@/lib/consulthire/client";
import {
  generateRoleInterview,
  generateRoleInterviewsForPublishedJobs,
} from "@/lib/consulthire/roles";
import { requireAdmin, type AdminSessionUser } from "@/lib/neon/auth";
import { isUuid, NeonConfigError } from "@/lib/neon/client";
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
    // Create-and-publish is a publish. The hook belongs to the event, not to
    // the button, so a job that goes live this way gets its AI interview too.
    if (status === "PUBLISHED") scheduleInterviewGeneration(job.id);
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
  const result = await moveStatus(id, "PUBLISHED", "publish");
  if (result.ok) scheduleInterviewGeneration(result.id);
  return result;
}

export async function unpublishJobAction(id: string): Promise<JobActionResult> {
  return moveStatus(id, "UNPUBLISHED", "unpublish");
}

export async function archiveJobAction(id: string): Promise<JobActionResult> {
  return moveStatus(id, "ARCHIVED", "archive");
}

// ------------------------------------------------- ConsultHire AI interviews

/**
 * Kick off interview generation for a job that has just been published.
 *
 * AFTER THE RESPONSE, NOT INSIDE IT, and this is the whole design of the hook.
 * Generating an interview plan is an LLM call at ConsultHire and client.ts
 * allows it a sixty-second timeout. Awaiting that inside publishJobAction
 * would mean a recruiter pressing Publish and watching a spinner for up to a
 * minute before their job appears on the careers page, for a feature that is
 * not what they asked for. after() runs the work on the same request's tail,
 * once the response has gone, so publishing stays as fast as it was.
 *
 * NOTHING HERE CAN FAIL THE PUBLISH. The job is already published and already
 * revalidated by the time this is scheduled. generateRoleInterview never
 * throws and writes its own failure to consulthire_status, so the worst case is
 * a job on the careers page with a FAILED pill in the admin list and a Generate
 * action to retry it. after() itself is wrapped because it throws when called
 * outside a request scope, and scheduling optional work is never worth turning
 * a completed publish into an error message.
 *
 * THE VISIBLE CONSEQUENCE, so nobody treats it as a bug: the admin's own
 * router.refresh() lands while generation is still in flight, so the row reads
 * Pending. One more refresh shows Ready. That is honest, and it is why PENDING
 * exists as a status at all.
 */
function scheduleInterviewGeneration(jobId: string): void {
  // Asked before scheduling so a deployment without ConsultHire credentials
  // does no work and logs nothing. Easy Apply only is a supported setup.
  if (!consultHireConfig()) return;

  try {
    after(async () => {
      await generateRoleInterview(jobId);
      // Revalidated again from inside after(): the first pass ran before the
      // status moved to READY, so without this the cached /admin/jobs render
      // keeps the Pending pill until something else invalidates it.
      revalidatePath("/admin/jobs");
      revalidatePath(`/admin/jobs/${jobId}`);
    });
  } catch (error) {
    logServerError("admin-jobs/publish", error, { jobId, stage: "schedule-interview" });
  }
}

export type GenerateInterviewResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const NO_CONSULTHIRE =
  "AI interviews are not configured on this deployment, so there is nothing to generate. " +
  "Set CONSULTHIRE_BASE_URL, CONSULTHIRE_API_KEY and CONSULTHIRE_WEBHOOK_SECRET.";

/**
 * Generate, or regenerate, one job's AI interview on demand.
 *
 * SYNCHRONOUS, unlike the publish hook, and for the opposite reason: the
 * recruiter pressed a button whose only purpose is this, so waiting for it is
 * what they are expecting and the result is what they want to be told. Hiding
 * it behind after() would make the button report success before anything had
 * happened and leave them refreshing to find out whether it worked.
 *
 * IDEMPOTENT. A job that already has a link is left alone and reported as
 * already done, so pressing the item twice costs one LLM call. `force` is the
 * deliberate "the description changed, rebuild it".
 */
export async function generateJobInterviewAction(
  id: string,
  options: { force?: boolean } = {},
): Promise<GenerateInterviewResult> {
  const auth = await authorize("generate-interview");
  if (!auth.ok) return auth;
  if (!isUuid(id)) return { ok: false, error: NO_ID };
  if (!consultHireConfig()) return { ok: false, error: NO_CONSULTHIRE };

  const result = await generateRoleInterview(id, { force: options.force });
  revalidateJobPaths(id);

  if (!result.ok) {
    // The message came from ConsultHire by way of client.ts and was written
    // for a recruiter, so it is shown verbatim. `retryable` decides whether to
    // suggest trying again or to leave them looking at the real cause.
    return {
      ok: false,
      error: result.retryable ? `${result.error} Please try again in a moment.` : result.error,
    };
  }

  switch (result.outcome) {
    case "generated":
      return {
        ok: true,
        message: result.created
          ? "AI interview generated. Candidates can now apply through it."
          : "AI interview rebuilt from the current job description.",
      };
    case "unchanged":
      return { ok: true, message: "This job already has an AI interview." };
    case "skipped":
      return result.reason === "not-configured"
        ? { ok: false, error: NO_CONSULTHIRE }
        : {
            ok: false,
            error:
              "Only a published job can have an AI interview, because the link is offered on the " +
              "public posting. Publish the job, then generate it.",
          };
  }
}

/**
 * Generate for every published job that has no usable interview yet.
 *
 * WHY THIS SHAPE OF BULK ACTION RATHER THAN CHECKBOXES. Making the jobs table
 * selectable would mean turning a server-rendered table into a client
 * component, and the only thing anyone would ever select is "the ones that do
 * not have an interview" — which the database can answer precisely and without
 * the recruiter ticking twenty boxes to express it. The eligible set is defined
 * once, in listJobsNeedingConsultHire, and both the count on the button and the
 * set acted on read it, so the two cannot disagree.
 *
 * Capped per invocation. Each job is an LLM call at the far end, and a
 * serverless function has a wall clock; a sweep that attempts two hundred jobs
 * is a sweep that gets killed halfway with no report. Pressing it again picks
 * up where it left off, because a generated job is no longer eligible.
 */
export async function generateJobInterviewsBulkAction(): Promise<GenerateInterviewResult> {
  const auth = await authorize("generate-interviews-bulk");
  if (!auth.ok) return auth;
  if (!consultHireConfig()) return { ok: false, error: NO_CONSULTHIRE };

  const summary = await generateRoleInterviewsForPublishedJobs(BULK_GENERATE_MAX);
  revalidatePath("/admin/jobs");

  if (summary.attempted === 0) {
    return { ok: true, message: "Every published job already has an AI interview." };
  }

  const parts = [`${summary.generated} generated`];
  if (summary.unchanged > 0) parts.push(`${summary.unchanged} already had one`);
  if (summary.failed > 0) parts.push(`${summary.failed} failed`);

  // Reported as a success even with failures, because the successes are real
  // and the per-job reasons are on the rows. A bulk action that reports itself
  // as failed because one of twenty did is a bulk action nobody trusts.
  return { ok: true, message: `${parts.join(", ")}.` };
}

/** How many jobs one sweep will attempt. See the note above on why it is low. */
const BULK_GENERATE_MAX = 10;

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
