import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

import type { JobRow } from "@/lib/neon/types";

/**
 * The ConsultHire side of the AI interview integration.
 *
 * Everything that talks to ConsultHire goes through here: creating the
 * role-level interview when a job is published, minting the signed token that
 * launches a candidate's session, and verifying the completion webhook coming
 * back. One module, so there is one place where the shared secrets are read
 * and one place to look when the integration misbehaves.
 *
 * `server-only` is the first import deliberately. These functions close over
 * CONSULTHIRE_API_KEY and CONSULTHIRE_WEBHOOK_SECRET, and a stray import from
 * a client component would bundle them into JavaScript served to the browser.
 * The import makes that a build error rather than a quiet leak.
 */

/** Interview length requested for generated roles, in minutes. */
const DEFAULT_DURATION_MIN = 20;

/** How long a launch token stays valid. Matches ConsultHire's reader. */
const LAUNCH_TTL_SECONDS = 60 * 60;

export type ConsultHireConfig = {
  baseUrl: string;
  apiKey: string;
  secret: string;
};

/**
 * Configuration, or null when the integration is switched off.
 *
 * Null rather than throwing: a deployment without ConsultHire credentials is a
 * valid deployment. It publishes jobs, takes Easy Apply applications and never
 * offers the AI route. Publishing must not fail because an optional
 * integration is unconfigured.
 */
export function consultHireConfig(): ConsultHireConfig | null {
  const baseUrl = (process.env.CONSULTHIRE_BASE_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.CONSULTHIRE_API_KEY || "";
  const secret = process.env.CONSULTHIRE_WEBHOOK_SECRET || "";
  if (!baseUrl || apiKey.length < 32 || secret.length < 32) return null;
  return { baseUrl, apiKey, secret };
}

// ------------------------------------------------------- role generation

export type RoleGenerationResult =
  | { ok: true; roleId: string; slug: string; url: string; created: boolean }
  | { ok: false; error: string; retryable: boolean };

/**
 * The job description ConsultHire interviews against.
 *
 * THE WHOLE POSTING, NOT THE TITLE. An interview plan generated from "AI
 * Engineer" asks generic questions any AI engineer could answer. One generated
 * from the responsibilities and requirements asks about the things this
 * specific job needs, which is the entire value of the feature. Everything the
 * recruiter wrote goes across.
 */
export function jobDescriptionText(job: JobRow): string {
  const parts: string[] = [job.description?.trim() || ""];

  if (job.responsibilities?.length) {
    parts.push("\nResponsibilities:\n" + job.responsibilities.map((r) => `- ${r}`).join("\n"));
  }
  if (job.requirements?.length) {
    parts.push("\nRequirements:\n" + job.requirements.map((r) => `- ${r}`).join("\n"));
  }
  if (job.department) parts.push(`\nDepartment: ${job.department}`);
  if (job.location) parts.push(`Location: ${job.location}`);

  return parts.filter(Boolean).join("\n").trim();
}

/**
 * Creates or refreshes the role interview for a job.
 *
 * Idempotent on the job id at the far end, so republishing updates one role
 * rather than creating a second link for the same opening.
 *
 * `retryable` separates "try again in a minute" from "this will never work".
 * A 5xx or a network fault is worth another attempt; a 400 saying the text is
 * not a job description is not, and a recruiter should be told to fix the
 * posting rather than watch a button fail repeatedly.
 */
export async function createRoleInterview(job: JobRow): Promise<RoleGenerationResult> {
  const config = consultHireConfig();
  if (!config) {
    return { ok: false, error: "ConsultHire is not configured on this deployment.", retryable: false };
  }

  const jdText = jobDescriptionText(job);
  if (jdText.length < 50) {
    return {
      ok: false,
      error:
        "This job has too little description to build an interview from. Add responsibilities and requirements, then try again.",
      retryable: false,
    };
  }

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/api/partner/roles`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": config.apiKey },
      body: JSON.stringify({
        externalJobId: job.id,
        title: job.title,
        jdText,
        durationMin: DEFAULT_DURATION_MIN,
      }),
      // Generating an interview plan is an LLM call at the far end, so it is
      // slow by nature. Long enough to succeed, bounded so a hung request
      // cannot hold a serverless function open until the platform kills it.
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.name === "TimeoutError"
        ? "ConsultHire took too long to respond."
        : "Could not reach ConsultHire.",
      retryable: true,
    };
  }

  if (!response.ok) {
    let message = `ConsultHire returned ${response.status}.`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // Non-JSON error body: the status code is all we have.
    }
    return { ok: false, error: message, retryable: response.status >= 500 };
  }

  const body = (await response.json()) as {
    role?: { id?: string; slug?: string };
    created?: boolean;
  };
  if (!body?.role?.id || !body.role.slug) {
    return { ok: false, error: "ConsultHire returned no interview link.", retryable: true };
  }

  return {
    ok: true,
    roleId: body.role.id,
    slug: body.role.slug,
    url: `${config.baseUrl}/i/${body.role.slug}`,
    created: body.created !== false,
  };
}

// --------------------------------------------------------- launch tokens

export type LaunchPayload = {
  appId: string;
  interviewId: string;
  name: string;
  email: string;
  jobId: string;
  exp: number;
};

/**
 * Mints the signed token that carries a candidate's identity to ConsultHire.
 *
 * WHY NOT JUST PUT THE IDS IN THE URL. They would be query parameters on a
 * public page, so anyone could edit them: change the application id and your
 * interview result lands on somebody else's hiring record. The facts travel
 * inside an HMAC instead, so the URL is still copyable but no longer editable,
 * and the signature is checked before ConsultHire believes a word of it.
 */
export function createLaunchToken(
  payload: Omit<LaunchPayload, "exp">,
  config: ConsultHireConfig,
): string {
  const full: LaunchPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + LAUNCH_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  const sig = createHmac("sha256", config.secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** The URL a candidate is sent to after their application row exists. */
export function launchUrl(
  slug: string,
  payload: Omit<LaunchPayload, "exp">,
  config: ConsultHireConfig,
): string {
  const url = new URL(`${config.baseUrl}/i/${slug}`);
  url.searchParams.set("t", createLaunchToken(payload, config));
  // Display-only convenience so the candidate does not retype what they just
  // entered. ConsultHire ignores these whenever a token is present.
  url.searchParams.set("name", payload.name);
  url.searchParams.set("email", payload.email);
  return url.toString();
}

// -------------------------------------------------------------- webhooks

/** Seconds a signed webhook stays acceptable, bounding the replay window. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export type WebhookVerification =
  | { ok: true }
  | { ok: false; reason: "not-configured" | "missing-headers" | "stale" | "bad-signature" };

/**
 * Verifies a completion webhook.
 *
 * The endpoint it guards is a public URL that writes interview scores onto
 * hiring records, so "did this really come from ConsultHire" is the only thing
 * standing between an open internet and a forged 10/10.
 *
 * The timestamp is inside the signed material, not merely alongside it. If it
 * were only a header, an attacker could replay a captured body with a fresh
 * timestamp; signing `timestamp.body` together means the pair cannot be
 * recombined.
 */
export function verifyWebhookSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  now: Date = new Date(),
): WebhookVerification {
  const secret = process.env.CONSULTHIRE_WEBHOOK_SECRET || "";
  if (secret.length < 32) return { ok: false, reason: "not-configured" };
  if (!timestamp || !signature) return { ok: false, reason: "missing-headers" };

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: "missing-headers" };
  const ageSeconds = Math.abs(now.getTime() / 1000 - sent);
  if (ageSeconds > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: "stale" };

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Length is checked first because timingSafeEqual requires equal lengths,
  // and a wrong length is already a failed verification.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }
  return { ok: true };
}

/** Score at or above which a candidate is surfaced for second-round review. */
export const SECOND_ROUND_THRESHOLD = 8;
