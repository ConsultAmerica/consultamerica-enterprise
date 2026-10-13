"use server";

/**
 * The public AI interview route.
 *
 * Same spine as app/jobs/[slug]/apply/actions.ts, which is the point: this is a
 * second door into the same recruitment system, not a second system, so it
 * rate-limits with the same limiter, validates with the same rules and files
 * through the same submitApplication transaction.
 *
 *   1. Rate limit.            Cheapest refusal first, before any I/O.
 *   2. Validate every field.  Everything here arrives from a public form.
 *   3. Resolve the job.       PUBLISHED, open, and with a READY interview.
 *   4. Store the résumé.      OPTIONAL on this route; see below.
 *   5. File it.               One transaction: candidate, application with
 *                             method AI_INTERVIEW, the AI_SCREEN interview row,
 *                             APPLIED activity, Zoho outbox row.
 *   6. Mint the launch URL.   Only now, from ids that exist.
 *   7. after(): notify.       The recruiting inbox, post-response.
 *
 * THE ORDER OF 5 AND 6 IS THE WHOLE DESIGN. The candidate must never reach
 * ConsultHire before their application row exists. If they did, the completion
 * webhook would arrive carrying an externalAppId that matches nothing, there
 * would be no interviews row to write the score onto, and the candidate would
 * have sat a twenty-minute interview that produced a result with nowhere to go.
 * So the transaction commits first and the URL is built from what it returned.
 *
 * WHY THE RÉSUMÉ IS OPTIONAL HERE AND MANDATORY ON EASY APPLY. Easy Apply is a
 * form whose entire output is a document: without the CV there is nothing for a
 * recruiter to read and the application is unworkable, which is why that path
 * refuses to file without one. This route produces a different artefact. The
 * interview is the evidence, and a scored twenty-minute conversation about this
 * specific job description is a more useful screening signal than a PDF. Making
 * a file upload the price of entry would also undo the one thing the route is
 * for, which is letting somebody apply from a phone in two minutes. So a résumé
 * is accepted and attached when offered, and its absence is not a refusal.
 */

import { headers } from "next/headers";
import { after } from "next/server";

import { consultHireConfig, launchUrl } from "@/lib/consulthire/client";
import { submitApplication, SubmitApplicationError } from "@/lib/neon/applications";
import { getJobBySlug } from "@/lib/neon/jobs";
import { ResumeValidationError, uploadResume, type StoredResume } from "@/lib/neon/resume-storage";
import { logServerError } from "@/lib/observability/logger";
import {
  clientIp,
  RATE_LIMITED_MESSAGE,
  withinApplyRateLimit,
} from "@/lib/security/apply-rate-limit";

export type StartAiInterviewResult =
  | { ok: true; reference: string; launchUrl: string }
  | { ok: false; error: string };

/** Anything unexpected becomes this. Never a stack, never a driver message. */
const GENERIC_ERROR = "We couldn't start your interview. Please try again.";
const NOT_AVAILABLE =
  "The AI interview for this role is not available right now. You can still use Easy Apply.";

// ------------------------------------------------------------------ validation

/**
 * One field off the form: a string, trimmed, length-capped, NUL-free.
 *
 * NUL matters specifically: Postgres `text` rejects U+0000 with error 22P05, so
 * a single stray byte in a name would abort the whole submit transaction.
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

export async function startAiInterviewAction(
  formData: FormData,
): Promise<StartAiInterviewResult> {
  const requestHeaders = await headers();

  const limited = !withinApplyRateLimit(clientIp(requestHeaders), (error) =>
    logServerError("ai-interview.rate-limit", error),
  );
  if (limited) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }

  // Read before anything else is attempted. A deployment with no credentials
  // cannot mint a launch token, so there is no point taking the candidate's
  // details: the public page does not render this form in that case, and a
  // direct POST is told plainly rather than being half-processed.
  const config = consultHireConfig();
  if (!config) {
    return { ok: false, error: NOT_AVAILABLE };
  }

  const slug = field(formData, "slug", 128).toLowerCase();
  const firstName = line(formData, "firstName", 100);
  const lastName = line(formData, "lastName", 100);
  const email = field(formData, "email", 254);
  const phone = line(formData, "phone", 40);
  const location = line(formData, "location", 160);
  const linkedinRaw = field(formData, "linkedinUrl", 500);

  if (!SLUG_PATTERN.test(slug)) {
    return { ok: false, error: "That role could not be found." };
  }
  if (firstName === "" || lastName === "") {
    return { ok: false, error: "Please enter your first and last name." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  // Phone is required on both routes. It is the only channel that works when a
  // candidate's email silently bounces, and a staffing firm that cannot reach a
  // shortlisted person has an unworkable application whichever way it arrived.
  if (phone === "") {
    return { ok: false, error: "Please enter a phone number." };
  }

  const linkedinUrl = normalizeProfileUrl(linkedinRaw);
  if (linkedinUrl === null) {
    return { ok: false, error: "Please enter a valid LinkedIn URL, or leave it blank." };
  }

  let job;
  try {
    job = await getJobBySlug(slug);
  } catch (error) {
    logServerError("ai-interview.job-lookup", error, { slug });
    return { ok: false, error: GENERIC_ERROR };
  }

  if (!job) {
    return { ok: false, error: "That role could not be found." };
  }
  if (job.status !== "PUBLISHED") {
    return { ok: false, error: "This position is no longer accepting applications." };
  }
  /*
    RE-CHECKED HERE, not trusted from the page that rendered the form. A Server
    Action is reachable by direct POST, and the slug is the only thing the
    client supplies, so "does this role actually have a generated interview" has
    to be asked against the row. Without it a crafted POST would file an
    AI_INTERVIEW application and then be handed a launch URL for a role that
    does not exist at the far end.
  */
  if (job.consulthire_status !== "READY" || !job.consulthire_slug) {
    return { ok: false, error: NOT_AVAILABLE };
  }

  /*
    The résumé, when there is one. Optional, so every failure here degrades to
    "no résumé" rather than refusing the application: see the note at the top of
    this file for why that is the right trade on this route and the wrong one on
    Easy Apply. A candidate who attached a file they cannot use is still better
    served by reaching the interview than by being sent back to a form.
  */
  let stored: StoredResume | null = null;
  let resumeFile: File | null = null;
  const resume = formData.get("resume");
  if (resume instanceof File && resume.size > 0) {
    resumeFile = resume;
    try {
      stored = await uploadResume(resume, job.reference);
    } catch (error) {
      if (error instanceof ResumeValidationError) {
        // The one case worth stopping for: the candidate chose a file and it is
        // the wrong kind, which they can fix in seconds. Silently dropping it
        // would have them believe their CV was attached when it was not.
        return { ok: false, error: error.message };
      }
      logServerError("ai-interview.resume-upload", error, {
        jobReference: job.reference,
        size: resume.size,
      });
      // Storage is down, which is not the candidate's problem and not worth
      // blocking the interview over.
      stored = null;
    }
  }

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
      source: "careers",
      method: "AI_INTERVIEW",
      withAiScreen: true,
    });
  } catch (error) {
    if (error instanceof SubmitApplicationError) {
      // JOB_NOT_PUBLISHED reaching here means the role closed between the
      // lookup above and the transaction. Its message is already candidate-safe.
      return { ok: false, error: error.message };
    }
    logServerError("ai-interview.submit", error, { jobId: job.id });
    return { ok: false, error: GENERIC_ERROR };
  }

  const { application, interview } = filed;
  if (!interview) {
    /*
      submitApplication was asked for an interview row and returned none, which
      it cannot do without throwing. Treated as a hard failure anyway rather
      than launching without one: sending the candidate on from here is exactly
      the scenario this whole ordering exists to prevent, and the application is
      already filed, so a recruiter still has their details and the Easy Apply
      record is intact.
    */
    logServerError(
      "ai-interview.missing-interview",
      new Error("Application filed with no AI_SCREEN interview row; refusing to launch."),
      { applicationId: application.id },
    );
    return { ok: false, error: GENERIC_ERROR };
  }

  /*
    The launch URL, built last, from ids that now exist.

    The candidate's identity travels inside an HMAC rather than as query
    parameters, so the link is copyable but not editable: without that, changing
    appId in the address bar would land your interview result on somebody else's
    hiring record. See createLaunchToken in lib/consulthire/client.ts.
  */
  const url = launchUrl(
    job.consulthire_slug,
    {
      appId: application.id,
      interviewId: interview.id,
      name: `${firstName} ${lastName}`,
      email,
      jobId: job.id,
    },
    config,
  );

  /*
    The résumé bytes for the notification attachment, read from the File that
    was just uploaded rather than fetched back from Blob storage.

    Swallowed to null on failure. The attachment is a convenience; the
    application is filed and the candidate is already on their way to the
    interview.
  */
  let resumeAttachment: { filename: string; contentBase64: string } | null = null;
  if (resumeFile && stored) {
    try {
      const buffer = Buffer.from(await resumeFile.arrayBuffer());
      resumeAttachment = {
        filename: stored.filename,
        contentBase64: buffer.toString("base64"),
      };
    } catch (error) {
      logServerError("ai-interview.resume-attachment", error, {
        reference: application.reference,
      });
    }
  }

  scheduleNotification({
    applicationId: application.id,
    reference: application.reference,
    jobTitle: job.title,
    candidateName: `${firstName} ${lastName}`,
    candidateEmail: email,
    candidatePhone: phone,
    candidateLocation: location || null,
    candidateLinkedIn: linkedinUrl || null,
    resumeFilename: stored?.filename ?? null,
    resumeAttachment,
  });

  return { ok: true, reference: application.reference, launchUrl: url };
}

// ------------------------------------------------------------- after(response)

type NotificationInput = {
  applicationId: string;
  reference: string;
  jobTitle: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  candidateLocation: string | null;
  candidateLinkedIn: string | null;
  resumeFilename: string | null;
  resumeAttachment: { filename: string; contentBase64: string } | null;
};

/**
 * The recruiting notification and the CRM push, after the response.
 *
 * Nothing here can fail the submission, which has already committed and whose
 * launch URL the candidate is already following. after() itself is wrapped
 * because it throws outside a request scope.
 */
function scheduleNotification(input: NotificationInput): void {
  try {
    after(async () => {
      await mailApplication(input);
      await pushToZoho(input);
    });
  } catch (error) {
    logServerError("ai-interview.after-scheduling", error, { reference: input.reference });
  }
}

/**
 * ONLY THE INTERNAL NOTIFICATION, no candidate confirmation.
 *
 * The candidate is being sent straight into the interview, so a "we received
 * your application" email landing while they are mid-conversation is noise
 * about something they are currently doing. They are told the application is in
 * on screen, with their reference, before the redirect. The one email worth
 * sending them comes later, if the recruiter invites them to a second round.
 */
async function mailApplication(input: NotificationInput): Promise<void> {
  try {
    const { renderApplicationNotification, sendRecruitingNotification } = await import(
      "@/lib/email/application-emails"
    );
    const rendered = renderApplicationNotification({
      candidateName: input.candidateName,
      candidateEmail: input.candidateEmail,
      candidatePhone: input.candidatePhone,
      // Read off the job row, never from the form: the client never submits a
      // title, and would not be believed if it did.
      jobTitle: input.jobTitle,
      applicationId: input.applicationId,
      applicationNumber: input.reference,
      source: "Careers Site",
      method: "AI_INTERVIEW",
      resumeFilename: input.resumeFilename,
      resumeAttachment: input.resumeAttachment,
      candidateLocation: input.candidateLocation,
      candidateLinkedIn: input.candidateLinkedIn,
    });

    const notified = await sendRecruitingNotification(rendered, {
      replyTo: input.candidateEmail,
      resumeAttachment: input.resumeAttachment,
    });
    console.info("[ai-interview-email]", {
      event: "sent",
      reference: input.reference,
      notified,
    });
  } catch (error) {
    logServerError("ai-interview.email", error, { reference: input.reference });
  }
}

/**
 * Drain the sync queue inline, right after enqueueing. Identical reasoning to
 * the Easy Apply path: the Vercel Hobby plan caps cron at one run a day, so the
 * inline attempt is the fast path and the daily sweep is the safety net.
 *
 * Unconfigured Zoho is skipped silently. Locally the credentials do not exist,
 * and logging an error on every submission for an optional integration that was
 * never switched on just trains people to ignore the logs.
 */
async function pushToZoho(input: NotificationInput): Promise<void> {
  try {
    const { isZohoConfigured } = await import("@/lib/zoho/token");
    if (!isZohoConfigured()) return;

    const { processDueSyncJobs } = await import("@/lib/zoho/sync");
    const summary = await processDueSyncJobs(5);
    console.info("[zoho-sync]", {
      event: "inline-after-ai-interview",
      reference: input.reference,
      ...summary,
    });
  } catch (error) {
    logServerError("ai-interview.zoho-sync", error, { reference: input.reference });
  }
}
