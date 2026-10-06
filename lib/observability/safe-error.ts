import { logServerError } from "@/lib/observability/logger";

/**
 * Base class for errors that were authored to be shown to an end user
 * verbatim — validation failures, permission denials, business-rule
 * rejections. Anything that is NOT a SafeUserError (a raw Postgres/Supabase
 * exception, an unexpected null-deref, a third-party client error) must never
 * reach the browser as-is: log it here and return the generic fallback
 * instead. See docs/REPOSITORY_TRUTH_AUDIT.md / known-issues.md for the
 * concrete leaks this replaces (payroll-actions.ts, lib/recruiting/actions.ts).
 */
export class SafeUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeUserError";
  }
}

/**
 * Resolve a caught error to a message safe to return from a server action.
 * - SafeUserError (and subclasses, e.g. self-service's SecurityError):
 *   the message was authored for end users — return it as-is, no logging needed.
 * - Anything else: log full technical detail server-side (context + meta for
 *   correlation) and return the generic fallback — never the raw error.
 */
export function toSafeMessage(
  error: unknown,
  fallback: string,
  context: string,
  meta?: Record<string, unknown>,
): string {
  if (error instanceof SafeUserError) return error.message;
  logServerError(context, error, meta);
  return fallback;
}
