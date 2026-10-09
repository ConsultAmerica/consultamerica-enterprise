"use server";

/**
 * Public Easy Apply, Neon edition.
 *
 * This is the one entry point where an anonymous visitor writes to the
 * recruitment database, so the shape of it is the point:
 *
 *   1. Rate limit.            Cheapest refusal first, before any I/O.
 *   2. Validate every field.  Everything here arrives from a public form.
 *   3. Resolve the job.       PUBLISHED only; submitApplication re-checks it
 *                             inside the transaction, so a role unpublished
 *                             between these two steps is still refused.
 *   4. Store the resume.      Blob being down must not cost us the application.
 *   5. File it.               One transaction: candidate, application,
 *                             APPLIED activity, Zoho outbox row.
 *   6. after(): notify.       Emails and the inline CRM push, post-response.
 *
 * The invariant everything above serves: once step 5 commits, the application
 * exists and the candidate is told so. No integration failure after that point
 * may turn a filed application into an error message, and nothing in steps 4 or
 * 6 is allowed to throw into the request path.
 *
 * Note it returns a result object rather than throwing. Production builds
 * redact thrown Server Action messages, and database or storage detail must
 * never reach a candidate's screen either way.
 */

import { createHash } from "node:crypto";

import { headers } from "next/headers";
import { after } from "next/server";

import { submitApplication, SubmitApplicationError } from "@/lib/neon/applications";
import { getJobBySlug } from "@/lib/neon/jobs";
import { ResumeValidationError, uploadResume, type StoredResume } from "@/lib/neon/resume-storage";
import { logServerError } from "@/lib/observability/logger";

export type SubmitApplicationActionResult =
  | { ok: true; reference: string }
  | { ok: false; error: string };

/** Anything unexpected becomes this. Never a stack, never a driver message. */
const GENERIC_ERROR = "We couldn't complete your application. Please try again.";
const RESUME_REQUIRED = "Please upload your resume (PDF or DOCX).";

// --------------------------------------------------------------- rate limiting

/**
 * Per-IP and global fixed windows, held in process memory.
 *
 * In-process is a deliberate floor, not the finished article. The shared
 * limiter this repo already has (lib/assistant/rate-limit.ts) is backed by
 * Supabase, which is exactly what this route is being moved off, and Neon has
 * no counter table in the 11-table schema. So: one window per server instance.
 * On Vercel that means a determined attacker spread across instances gets a
 * multiple of these numbers, which still turns an unbounded flood into a
 * bounded one. Move it to a Neon table when there is a reason to.
 *
 * Limits are sized for a real applicant, not an average one: a family or an
 * office behind one NAT address can legitimately file several applications in
 * an afternoon.
 */
const RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  perIp: 8,
  /** Backstop across all clients, so one window cannot drown the inbox. */
  global: 200,
} as const;

type Window = { startedAt: number; count: number };
const windows = new Map<string, Window>();

/** Salted hash: the limiter needs to tell clients apart, not to know who they are. */
function ipKey(ip: string): string {
  const salt = process.env.ASSISTANT_RATE_LIMIT_SALT || "consult-america-apply";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

function hit(key: string, limit: number, now: number): boolean {
  const start = now - (now % RATE_LIMIT.windowMs);
  const existing = windows.get(key);
  const window: Window =
    existing && existing.startedAt === start ? existing : { startedAt: start, count: 0 };
  window.count += 1;
  windows.set(key, window);

  // Bounded memory. Expired windows are dead weight once the clock moves on.
  if (windows.size > 10_000) {
    for (const [k, v] of windows) if (v.startedAt < start) windows.delete(k);
  }

  return window.count <= limit;
}

/**
 * Fails OPEN. A limiter that breaks and starts refusing genuine applicants
 * costs the business real candidates; a burst that gets through costs it a
 * noisy inbox for fifteen minutes. The asymmetry is not close.
 */
function withinRateLimit(ip: string): boolean {
  try {
    const now = Date.now();
    if (!hit(`ip:${ipKey(ip)}`, RATE_LIMIT.perIp, now)) return false;
    return hit("global", RATE_LIMIT.global, now);
  } catch (error) {
    logServerError("apply.rate-limit", error);
    return true;
  }
}

function clientIp(requestHeaders: Headers): string {
  const forwarded = requestHeaders.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return requestHeaders.get("x-real-ip")?.trim() || "unknown";
}

// ------------------------------------------------------------------ validation

/**
 * One field off the form: a string, trimmed, length-capped, NUL-free.
 *
 * NUL matters specifically: Postgres `text` rejects U+0000 with error 22P05, so a
 * single stray byte in a name would abort the whole submit transaction.
 */
function field(form: FormData, key: string, maxLength: number): string {
  const raw = form.get(key);
  if (typeof raw !== "string") return "";
  return raw.replace(/\u0000/g, "").trim().slice(0, maxLength);
}

/** Collapses newlines too: these render on one line in the recruiter's UI. */
function line(form: FormData, key: string, maxLength: number): string {
  return field(form, key, maxLength).replace(/\s+/g, " ");
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Matches lib/neon/jobs.ts slugify output. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;

/**
 * A LinkedIn profile link we are willing to store and later render as an
 * anchor. Scheme allowlist, not a blocklist: `javascript:` and `data:` URLs in
 * a recruiter-facing link are the whole risk here.
 */
function normalizeProfileUrl(value: string): string | null {
  if (value === "") return "";
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------- submit

export async function submitApplicationAction(
  formData: FormData,
): Promise<SubmitApplicationActionResult> {
  // Read before after(): request headers are available inside an after()
  // callback for Server Functions, but the IP is wanted up front regardless.
  const requestHeaders = await headers();

  if (!withinRateLimit(clientIp(requestHeaders))) {
    return {
      ok: false,
      error: "Too many applications from this connection. Please try again in a few minutes.",
    };
  }

  const slug = field(formData, "slug", 128).toLowerCase();
  const firstName = line(formData, "firstName", 100);
  const lastName = line(formData, "lastName", 100);
  const email = field(formData, "email", 254);
  const phone = line(formData, "phone", 40);
  const location = line(formData, "location", 160);
  const linkedinRaw = field(formData, "linkedinUrl", 500);
  // Not on the Easy Apply form today, but they are columns on `applications`
  // and the Detailed Apply flow will post them. Capped, never trusted.
  const relevantExperience = field(formData, "relevantExperience", 5000);
  const additionalInfo = field(formData, "additionalInfo", 5000);

  if (!SLUG_PATTERN.test(slug)) {
    return { ok: false, error: "That role could not be found." };
  }
  if (firstName === "" || lastName === "") {
    return { ok: false, error: "Please enter your first and last name." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (phone === "") {
    return { ok: false, error: "Please enter a phone number." };
  }

  const linkedinUrl = normalizeProfileUrl(linkedinRaw);
  if (linkedinUrl === null) {
    return { ok: false, error: "Please enter a valid LinkedIn URL, or leave it blank." };
  }

  const resume = formData.get("resume");
  if (!(resume instanceof File) || resume.size === 0) {
    return { ok: false, error: RESUME_REQUIRED };
  }

  // Step 3. Refusing here gives the candidate a clear message instead of the
  // generic one submitApplication's own gate would produce, and it saves
  // opening a transaction for a role that is closed.
  let job;
  try {
    job = await getJobBySlug(slug);
  } catch (error) {
    logServerError("apply.job-lookup", error, { slug });
    return { ok: false, error: GENERIC_ERROR };
  }

  if (!job) {
    return { ok: false, error: "That role could not be found." };
  }
  if (job.status !== "PUBLISHED") {
    return { ok: false, error: "This position is no longer accepting applications." };
  }

  // Step 4. Two different failures, handled differently on purpose:
  //
  //   - The file is wrong (not a PDF/DOCX, too big, empty). The candidate
  //     caused it and can fix it in ten seconds, so say so and stop. Filing a
  //     resume-less application for a staffing firm would be filing a dead one.
  //   - Storage is unavailable or the token is missing. Nothing the candidate
  //     can do, and the application is worth more than the attachment: log it
  //     and carry on with resume_url null.
  let stored: StoredResume | null = null;
  try {
    stored = await uploadResume(resume, job.reference);
  } catch (error) {
    if (error instanceof ResumeValidationError) {
      return { ok: false, error: error.message };
    }
    logServerError("apply.resume-upload", error, {
      jobReference: job.reference,
      size: resume.size,
    });
  }

  // Step 5. The transaction. Everything above is preparation; this is the
  // commit that means "the application exists".
  let filed;
  try {
    filed = await submitApplication({
      jobId: job.id,
      candidate: {
        email,
        firstName,
        lastName,
        phone,
        location: location || null,
        linkedinUrl: linkedinUrl || null,
      },
      resumeUrl: stored?.url ?? null,
      resumeFilename: stored?.filename ?? null,
      resumeSizeBytes: stored?.size ?? null,
      relevantExperience: relevantExperience || null,
      additionalInfo: additionalInfo || null,
      source: "careers",
    });
  } catch (error) {
    if (error instanceof SubmitApplicationError) {
      // JOB_NOT_PUBLISHED reaching here means the role closed between the
      // lookup above and the transaction. Its message is already candidate-safe.
      return { ok: false, error: error.message };
    }
    logServerError("apply.submit", error, { jobId: job.id });
    return { ok: false, error: GENERIC_ERROR };
  }

  const reference = filed.application.reference;

  // Step 6. Everything from here is notification, and the candidate has
  // already been told their application is in.
  scheduleNotifications({
    applicationId: filed.application.id,
    reference,
    jobTitle: job.title,
    candidateName: `${firstName} ${lastName}`,
    candidateEmail: email,
    candidatePhone: phone,
  });

  // Returned on a re-application too: submitApplication deliberately keeps the
  // original reference so the candidate is never quoted a second number for
  // the same application.
  return { ok: true, reference };
}

// ------------------------------------------------------------- after(response)

type NotificationInput = {
  applicationId: string;
  reference: string;
  jobTitle: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
};

/**
 * The two emails and the inline CRM push, after the response.
 *
 * Each side gets its own try/catch rather than sharing one: a Zoho outage must
 * not swallow the candidate's confirmation, and a rejected email address must
 * not stop the CRM write. Neither can fail the submission, which has already
 * committed and been acknowledged.
 */
function scheduleNotifications(input: NotificationInput): void {
  try {
    after(async () => {
      await mailApplication(input);
      await pushToZoho(input);
    });
  } catch (error) {
    // after() throws outside a request scope. Scheduling post-response work is
    // never worth turning a committed application into an error message, so
    // this is logged and dropped rather than rethrown.
    logServerError("apply.after-scheduling", error, { reference: input.reference });
  }
}

async function mailApplication(input: NotificationInput): Promise<void> {
  try {
    const { sendApplicationEmails } = await import("@/lib/email/application-emails");
    const sent = await sendApplicationEmails({
      candidateName: input.candidateName,
      candidateEmail: input.candidateEmail,
      candidatePhone: input.candidatePhone,
      // Read off the job row, never from the form: the client never submits a
      // title, and would not be believed if it did.
      jobTitle: input.jobTitle,
      applicationId: input.applicationId,
      applicationNumber: input.reference,
      source: "Careers Site",
    });
    console.info("[application-email]", { event: "sent", reference: input.reference, ...sent });
  } catch (error) {
    logServerError("apply.email", error, { reference: input.reference });
  }
}

/**
 * Drain the sync queue inline, right after enqueueing.
 *
 * The scheduled worker in vercel.json runs at 03:00 once a day, and that is a
 * billing constraint rather than a design choice: the Vercel team is on the
 * Hobby plan, which caps cron jobs at one invocation per day. Do not "fix" the
 * schedule to every few minutes; Hobby will simply not run it.
 *
 * So the inline attempt is the fast path (the row this request enqueued is due
 * immediately), and the daily cron is the safety net that sweeps whatever the
 * inline attempt failed on plus the retry backlog. The limit is small because
 * this runs on a candidate-facing request's tail, not in a worker.
 *
 * Unconfigured Zoho is skipped silently. Locally the credentials do not exist,
 * and logging an error on every single submission for an optional integration
 * that was never switched on just trains people to ignore the logs.
 */
async function pushToZoho(input: NotificationInput): Promise<void> {
  try {
    const { isZohoConfigured } = await import("@/lib/zoho/token");
    if (!isZohoConfigured()) return;

    const { processDueSyncJobs } = await import("@/lib/zoho/sync");
    const summary = await processDueSyncJobs(5);
    console.info("[zoho-sync]", { event: "inline-after-apply", reference: input.reference, ...summary });
  } catch (error) {
    logServerError("apply.zoho-sync", error, { reference: input.reference });
  }
}
