import { after } from "next/server";

import { verifyWebhookSignature } from "@/lib/consulthire/client";
import { parseConsultHireReport, score as narrowScore } from "@/lib/consulthire/report";
import { secondRoundEligibility } from "@/lib/consulthire/second-round";
import { getApplicationById } from "@/lib/neon/applications";
import { getCandidateById } from "@/lib/neon/candidates";
import { recordInterviewCompletion } from "@/lib/neon/interviews";
import { getJobById } from "@/lib/neon/jobs";
import { logServerError } from "@/lib/observability/logger";

/**
 * Completion webhook from ConsultHire.
 *
 * THE ONLY WAY AN INTERVIEW RESULT ENTERS THIS SYSTEM, and a public URL with no
 * session behind it, so the signature check is the entire security model. An
 * unauthenticated POST that got through would write a score of its choosing
 * onto a real person's hiring record.
 *
 * Four properties this handler is built around.
 *
 * 1. THE RAW BODY IS READ BEFORE ANYTHING IS PARSED. The signature covers the
 *    exact bytes ConsultHire sent. req.json() would give back a JavaScript
 *    object, and re-serialising that object produces different bytes (key
 *    order, number formatting, whitespace), so the HMAC would never match. So
 *    req.text() first, verify, and only then JSON.parse the string that was
 *    verified. Parsing attacker-controlled JSON before authenticating it is
 *    also how a parser becomes an attack surface.
 *
 * 2. A BAD SIGNATURE IS 401 AND IS LOGGED. Not 400, not a silent 200. A
 *    rejected delivery means either the shared secret has drifted between the
 *    two deployments or somebody is probing the endpoint, and both are things
 *    an operator needs to be able to find in the logs.
 *
 * 3. REPLAYS ARE NO-OPS THAT STILL ANSWER 200. ConsultHire retries on timeout
 *    and gives up on a non-2xx, so answering an error to a duplicate would
 *    make it retry a result that is already recorded. The idempotency itself
 *    lives in recordInterviewCompletion, under a row lock.
 *
 * 4. THE EMAIL IS SENT AFTER THE RESPONSE, AND ONLY ON A FIRST RECORDING. The
 *    result is committed before the notification is attempted, so a Resend
 *    outage cannot turn a recorded score into a non-2xx and trigger a redelivery
 *    of something already written. And only `recorded` sends: a retried webhook
 *    must not produce a second "interview complete" email.
 */

/** node:crypto, so not the edge runtime. */
export const runtime = "nodejs";

/** Headers ConsultHire signs with. See src/lib/partnerWebhook.ts at its end. */
const TIMESTAMP_HEADER = "x-consulthire-timestamp";
const SIGNATURE_HEADER = "x-consulthire-signature";

/**
 * Cap on the body we will read.
 *
 * The report is the biggest field and is a few kilobytes of JSON. 256 KB is
 * generous for that and small enough that an unauthenticated caller cannot make
 * this endpoint buffer megabytes before the signature is even checked, which
 * would be a free denial of service on an endpoint anyone can reach.
 */
const MAX_BODY_BYTES = 256 * 1024;

type WebhookPayload = {
  event?: string;
  interviewSessionId?: string;
  externalAppId?: string;
  /** Set when the candidate came straight from a job posting with no application yet. */
  externalJobId?: string;
  candidateName?: string;
  candidateEmail?: string;
  score?: number | null;
  verdict?: string | null;
  /** EvaluationReport JSON, already stringified by ConsultHire's scorer. */
  report?: string | null;
  completedAt?: string;
  transcriptUrl?: string | null;
};

export async function POST(req: Request) {
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json(413, { error: "Payload too large." });
  }

  // Step 1. The raw bytes, before anything interprets them.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (error) {
    logServerError("consulthire-webhook.read", error);
    return json(400, { error: "Could not read the request body." });
  }

  if (rawBody.length > MAX_BODY_BYTES) {
    return json(413, { error: "Payload too large." });
  }

  // Step 2. Authenticate, over the raw string.
  const verification = verifyWebhookSignature(
    rawBody,
    req.headers.get(TIMESTAMP_HEADER),
    req.headers.get(SIGNATURE_HEADER),
  );

  if (!verification.ok) {
    /*
      Logged with the reason, because the four reasons mean four different
      things to whoever is reading the log:

        not-configured  CONSULTHIRE_WEBHOOK_SECRET is unset on this deployment.
        missing-headers probably not ConsultHire at all; a probe or a health check.
        stale           clock skew between the two deployments, or a replay of a
                        captured request outside the tolerance window.
        bad-signature   the secrets have drifted apart, or it is a forgery.

      Never the body or the signature itself. The body carries a real person's
      interview and the signature is the material the secret protects.
    */
    logServerError(
      "consulthire-webhook.rejected",
      new Error(`Webhook signature verification failed: ${verification.reason}`),
      { reason: verification.reason, bodyBytes: rawBody.length },
    );
    // 401 even for not-configured. From the caller's side the request was not
    // authenticated, and which side is misconfigured is not their business.
    return json(401, { error: "Invalid signature." });
  }

  // Step 3. Only now is the body believed enough to parse.
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return json(400, { error: "Body is not valid JSON." });
  }

  /*
    Unknown events are accepted and ignored, not rejected.

    ConsultHire may add event types later, and a 400 would make it treat the
    new event as a delivery failure and retry it forever against a receiver
    that will never want it. 200 with `ignored` says "heard you, nothing to do".
  */
  if (payload.event !== "interview.completed") {
    return json(200, { ok: true, ignored: true, reason: "unsupported-event" });
  }

  const sessionId = text(payload.interviewSessionId, 128);
  if (!sessionId) {
    return json(400, { error: "interviewSessionId is required." });
  }

  /*
    TWO WAYS AN INTERVIEW REACHES US, AND ONLY ONE OF THEM HAS AN APPLICATION.

    `externalAppId` is present when the candidate was launched from an
    application that already existed. For everyone who clicked "Apply with AI"
    on a job posting there is no such row: the apply form was removed so people
    are not asked for the same name and email twice, which means this webhook
    is the first time Consult America hears about them.

    In that case the identity in the payload is used to create the candidate
    and the application before the result is recorded. It is trustworthy for
    exactly one reason: the signature over this body has already been verified
    above, so these fields came from ConsultHire and not from whoever posted
    the request.
  */
  let applicationId = text(payload.externalAppId, 64);

  if (!applicationId) {
    const externalJobId = text(payload.externalJobId, 64);
    const candidateEmail = text(payload.candidateEmail, 320)?.toLowerCase();
    const candidateName = text(payload.candidateName, 200) ?? "";

    if (!externalJobId || !candidateEmail) {
      return json(400, {
        error:
          "Without externalAppId, both externalJobId and candidateEmail are required to " +
          "create the application.",
      });
    }

    try {
      const { createApplicationForInterview } = await import("@/lib/consulthire/intake");
      applicationId = await createApplicationForInterview({
        externalJobId,
        candidateEmail,
        candidateName,
        sessionId,
      });
    } catch (error) {
      logServerError("consulthire-webhook.intake", error, { sessionId, externalJobId });
      return json(502, { error: "Could not record this interview against a job." });
    }

    if (!applicationId) {
      // The job was deleted, or the id is not one of ours. A 404 tells
      // ConsultHire not to keep retrying something that cannot succeed.
      return json(404, { error: "No job matches that externalJobId." });
    }
  }

  /*
    `report` arrives as a STRING, because ConsultHire stringifies the
    EvaluationReport before putting it in the payload. It is parsed here so the
    database stores real jsonb rather than a JSON string inside a jsonb, which
    would make every reader parse twice and every query inside it impossible.
    A malformed report is dropped to null rather than failing the whole
    delivery: the score and verdict are the parts that must land.
  */
  const reportJson = parseReportField(payload.report);
  const report = parseConsultHireReport(reportJson);

  const result = await recordInterviewCompletion({
    sessionId,
    applicationId,
    score: narrowScore(payload.score),
    verdict: text(payload.verdict, 200),
    report: reportJson,
    // The one-line headline goes into interviews.summary so the existing
    // Interviews panel has something to render without reaching into the jsonb.
    summary: report?.keySignal ?? null,
    completedAt: parseDate(payload.completedAt),
    transcriptUrl: text(payload.transcriptUrl, 1_000),
  }).catch((error: unknown) => {
    logServerError("consulthire-webhook.record", error, { sessionId, applicationId });
    return null;
  });

  if (result === null) {
    // A database failure, which IS worth a non-2xx: ConsultHire should retry,
    // because the result genuinely has not been stored.
    return json(503, { error: "Could not record the result. Please retry." });
  }

  switch (result.outcome) {
    case "not-found":
      /*
        200, not 404. There is no row because the application was deleted, or
        the interview was created at the far end without coming through our
        apply route. Either way no retry will ever find one, and a 404 would
        have ConsultHire redelivering forever. Logged, because an interview
        result with nowhere to go is worth somebody knowing about.
      */
      logServerError(
        "consulthire-webhook.orphan",
        new Error("Completion webhook had no matching interview row."),
        { sessionId, applicationId },
      );
      return json(200, { ok: true, ignored: true, reason: "no-matching-interview" });

    case "conflict":
      logServerError(
        "consulthire-webhook.conflict",
        new Error("Application already holds a different completed interview; refused."),
        { sessionId, applicationId },
      );
      return json(409, { error: "This application already has a different interview result." });

    case "duplicate":
      // A retry of something already recorded. Nothing written, nothing
      // emailed, and 200 so ConsultHire stops retrying.
      return json(200, { ok: true, duplicate: true });

    case "recorded":
      scheduleCompletionEmail(result.interview.application_id, sessionId);
      return json(200, { ok: true, recorded: true });
  }
}

/**
 * Everything other than POST.
 *
 * Explicit rather than left to the framework's 405, because this URL gets
 * visited by hand when somebody is debugging the integration and a sentence
 * naming the endpoint is more use than an empty page.
 */
export async function GET() {
  return json(405, {
    error: "This endpoint accepts signed POST requests from ConsultHire only.",
  });
}

// ------------------------------------------------------------ after(response)

/**
 * Tell the recruiting inbox a score has landed.
 *
 * After the response, for the reason at the top of this file: the result is
 * already committed, and an email failure must never become the non-2xx that
 * makes ConsultHire redeliver a webhook that has been recorded.
 *
 * The data is re-read here rather than threaded through from the write. It is
 * four small indexed reads on a path that no longer has anybody waiting on it,
 * and it keeps recordInterviewCompletion a database function with no idea what
 * an email is.
 */
function scheduleCompletionEmail(applicationId: string, sessionId: string): void {
  try {
    after(async () => {
      try {
        const application = await getApplicationById(applicationId);
        if (!application) return;

        const [candidate, job, { getAiInterview }] = await Promise.all([
          getCandidateById(application.candidate_id),
          getJobById(application.job_id),
          import("@/lib/neon/interviews"),
        ]);
        if (!candidate || !job) return;

        const interview = await getAiInterview(applicationId);
        if (!interview) return;

        const { sendInterviewCompletedNotification } = await import(
          "@/lib/email/interview-emails"
        );
        const { parseScore } = await import("@/lib/consulthire/second-round");

        const eligibility = secondRoundEligibility(interview);
        const sent = await sendInterviewCompletedNotification({
          candidateName:
            `${candidate.first_name} ${candidate.last_name}`.trim() || candidate.email,
          candidateEmail: candidate.email,
          jobTitle: job.title,
          applicationId: application.id,
          applicationNumber: application.reference,
          score: parseScore(interview.score),
          verdict: interview.verdict,
          report: parseConsultHireReport(interview.report),
          secondRoundEligible: eligibility.eligible,
        });
        console.info("[consulthire-webhook]", {
          event: "completion-notified",
          reference: application.reference,
          ...sent,
        });
      } catch (error) {
        logServerError("consulthire-webhook.email", error, { applicationId, sessionId });
      }
    });
  } catch (error) {
    // after() throws outside a request scope. The result is recorded either
    // way, so this is logged and dropped rather than rethrown.
    logServerError("consulthire-webhook.after-scheduling", error, { applicationId });
  }
}

// ------------------------------------------------------------------ narrowing

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A trimmed, capped, NUL-free string, or null. Postgres text rejects U+0000. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\u0000/g, "").trim().slice(0, max);
  return cleaned === "" ? null : cleaned;
}

/**
 * The report field, as a value fit for jsonb.
 *
 * Accepts the string ConsultHire sends today and an already-parsed object, so a
 * change at the far end from stringified to inline JSON does not silently store
 * a quoted blob.
 */
function parseReportField(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    // A report we cannot parse is not worth failing the delivery over. The
    // score and verdict are the fields that must land.
    return null;
  }
}

/**
 * completedAt, or now.
 *
 * Falling back to the current time rather than refusing: the interview
 * demonstrably finished, and a completed_at that is a few seconds out is far
 * better than a result rejected over a timestamp format. A future date is
 * clamped for the same reason an unparseable one is replaced, so the dashboard
 * cannot be made to show an interview completed next year.
 */
function parseDate(value: unknown): Date {
  const now = new Date();
  if (typeof value !== "string") return now;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return now;
  return parsed.getTime() > now.getTime() ? now : parsed;
}
