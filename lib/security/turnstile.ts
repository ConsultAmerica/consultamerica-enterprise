/**
 * Cloudflare Turnstile verification for public, cost-bearing endpoints.
 *
 * Design constraints that shaped this file:
 *
 * 1. It is INERT until both keys are configured. The site has no Turnstile
 *    site yet, so an unconfigured deployment must behave exactly as it did
 *    before this module existed. A half-deployed CAPTCHA that turns away real
 *    customers is worse than no CAPTCHA at all.
 * 2. Once configured it fails CLOSED on a missing or rejected token. A
 *    configured CAPTCHA that waves everyone through is theatre.
 * 3. But it fails OPEN when the fault is ours or Cloudflare's — an outage at
 *    challenges.cloudflare.com, or a mistyped secret — because neither is the
 *    visitor's fault and neither should take the contact form offline. Those
 *    cases log loudly instead, which is how they get noticed and fixed.
 *
 * No `import "server-only"` here on purpose: the client widget imports
 * `turnstileSiteKey()` so the env var name has exactly one definition. Both
 * keys are read lazily inside functions rather than at module scope, and
 * TURNSTILE_SECRET_KEY has no NEXT_PUBLIC_ prefix, so the bundler never inlines
 * it into client code.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** A hanging verify must not hang the request it is gating. */
const VERIFY_TIMEOUT_MS = 5_000;

/**
 * Turnstile tokens are documented as up to 2048 characters. Anything far past
 * that is not a token, so reject it here rather than relaying it to Cloudflare.
 */
const MAX_TOKEN_LENGTH = 4096;

/**
 * siteverify answers HTTP 200 with `success: false` both when the visitor's
 * token is bad and when OUR request was bad. Only the first group is the
 * visitor's problem; the rest mean the deployment is misconfigured, and
 * blocking every visitor over our own configuration error is the failure mode
 * this module exists to avoid.
 */
const OUR_FAULT_ERROR_CODES = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "bad-request",
  "internal-error",
]);

export type TurnstileResult = {
  ok: boolean;
  /** Short machine-readable cause, safe to log. Never contains key material. */
  reason?: string;
};

/** The public site key, or null when unset. Safe to call on the client. */
export function turnstileSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return key ? key : null;
}

function turnstileSecretKey(): string | null {
  const key = process.env.TURNSTILE_SECRET_KEY?.trim();
  return key ? key : null;
}

/**
 * True only when BOTH keys are present. One key alone cannot produce a working
 * challenge, so treating a partial configuration as "on" would reject real
 * traffic for a setup that can never succeed.
 */
export function isTurnstileEnabled(): boolean {
  return turnstileSiteKey() !== null && turnstileSecretKey() !== null;
}

/**
 * Logged at error level rather than warn: every branch that reaches here means
 * the protection is silently not protecting anything, which someone has to act
 * on. Never logs the secret, and never the token itself — length only, which is
 * enough to tell "nothing submitted" from "something submitted and rejected".
 */
function logFailOpen(reason: string, detail: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      level: "error",
      context: "turnstile",
      event: "fail-open",
      reason,
      at: new Date().toISOString(),
      ...detail,
    }),
  );
}

export async function verifyTurnstile(
  token: string | null,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = turnstileSecretKey();

  // Not configured: pass through untouched. This is the state the site is in
  // today, and every existing endpoint must behave identically in it.
  if (!secret || !turnstileSiteKey()) return { ok: true, reason: "disabled" };

  const response = typeof token === "string" ? token.trim() : "";
  if (!response) return { ok: false, reason: "missing-token" };
  if (response.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "oversized-token" };

  const form = new URLSearchParams({ secret, response });
  // remoteip is optional and only tightens the check. "unknown" is the sentinel
  // used elsewhere in this codebase when no forwarding header was present, and
  // sending it would make Cloudflare reject a valid token.
  if (remoteIp && remoteIp !== "unknown") form.set("remoteip", remoteIp);

  let res: Response;
  try {
    res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch (error) {
    // Network failure or the 5s timeout firing. Cloudflare having a bad day
    // must not take the contact form down with it.
    logFailOpen("verifier-unreachable", {
      message: error instanceof Error ? error.message : String(error),
      tokenLength: response.length,
    });
    return { ok: true, reason: "verifier-unreachable" };
  }

  if (!res.ok) {
    logFailOpen("verifier-http-error", { status: res.status, tokenLength: response.length });
    return { ok: true, reason: "verifier-http-error" };
  }

  let payload: { success?: unknown; "error-codes"?: unknown };
  try {
    payload = (await res.json()) as typeof payload;
  } catch (error) {
    // A 200 we cannot parse is a broken verifier, not a failed visitor.
    logFailOpen("verifier-unparseable", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: true, reason: "verifier-unparseable" };
  }

  if (payload.success === true) return { ok: true };

  const codes = Array.isArray(payload["error-codes"])
    ? payload["error-codes"].filter((c): c is string => typeof c === "string")
    : [];

  if (codes.some((code) => OUR_FAULT_ERROR_CODES.has(code))) {
    logFailOpen("misconfigured", { codes, tokenLength: response.length });
    return { ok: true, reason: "misconfigured" };
  }

  // Genuinely a bad token: missing-input-response, invalid-input-response, or
  // timeout-or-duplicate (an expired or already-spent token). Fail closed.
  return { ok: false, reason: codes.join(",") || "rejected" };
}
