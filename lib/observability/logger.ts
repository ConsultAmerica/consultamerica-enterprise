/**
 * Minimal, dependency-free server-side error logging. No Sentry/observability
 * vendor is wired into this repo today — this exists so catching an error to
 * sanitize its user-facing message never means throwing away the technical
 * detail. Swap the console.error call for a real sink (Sentry, Datadog, a
 * structured log shipper) in one place when one is adopted.
 *
 * TWO PROPERTIES THIS FILE EXISTS TO GUARANTEE, both learned the hard way from
 * an admin sign-in that failed only on Vercel (see app/admin/login/actions.ts):
 *
 *  1. ONE LINE PER ERROR, AND IT IS GREPPABLE. Every record is a single line of
 *     JSON prefixed with SERVER_ERROR_TAG, so `server-error` finds every
 *     failure in Vercel's log viewer and `"context":"admin-auth/sign-in"` finds
 *     one call site. A stack printed raw spans thirty lines, and Vercel's log
 *     search matches per line, which is how a stack becomes unfindable.
 *     JSON.stringify escapes the newlines in `stack`, so the line stays one
 *     line and the stack is still there.
 *
 *  2. THE ERROR IS DESCRIBED, NOT JUST NAMED. `name` + `message` is not enough
 *     in a serverless runtime: a failed `fetch` reports "fetch failed" and
 *     hides the real reason (ENOTFOUND, a TLS failure, a refused connection)
 *     one level down in `cause`, and a Postgres error carries its SQLSTATE in
 *     `code`. Both are followed below. Without them a production-only database
 *     failure is indistinguishable from any other throw.
 *
 * This module must never throw. It is called from inside catch blocks whose
 * whole job is to turn a failure into a safe message, so a throw here would
 * replace a handled error with an unhandled one and lose the original — the
 * previous version did exactly that if `meta` was circular or held a BigInt,
 * because it handed both straight to JSON.stringify.
 */

/** Prefix on every line this module writes. Grep for it. */
export const SERVER_ERROR_TAG = "server-error";

/** Four lowercase hex characters. */
export const ERROR_REF_PATTERN = /^[0-9a-f]{4}$/;

/**
 * A short correlation id, shown to the user and recorded in the log line for
 * the same failure, so "sign-in said ref 3f9a" points at one record instead of
 * a bisect.
 *
 * Deliberately only 16 bits. It is not a secret, not a primary key and not a
 * trace id: it exists so a human reading a support message can find a log line
 * from the last few minutes, and four characters are short enough to be read
 * over the phone. Collisions are expected and harmless — every record also
 * carries `context` and an ISO timestamp, which disambiguate.
 *
 * Math.random, not node:crypto.randomBytes, on purpose: this value reveals
 * nothing and guards nothing, so unpredictability buys no security, and
 * avoiding the import keeps this module safe to pull into any runtime.
 */
export function newErrorRef(): string {
  return Math.floor(Math.random() * 0x1_0000)
    .toString(16)
    .padStart(4, "0");
}

/** True for a value that is shaped like one of our refs. Used before echoing a
 *  URL-supplied ref back into a page, so the query string cannot inject text. */
export function isErrorRef(value: string | null | undefined): boolean {
  return !!value && ERROR_REF_PATTERN.test(value);
}

/** Stacks are capped because Vercel truncates an over-long log line, and a
 *  truncated line can lose the JSON's closing brace and stop being parseable. */
const MAX_STACK_CHARS = 2_000;
const MAX_MESSAGE_CHARS = 500;

/** How far down a `cause` chain to walk. Three is enough for the common
 *  wrapper-over-wrapper-over-syscall shape and cannot loop forever. */
const MAX_CAUSE_DEPTH = 3;

type ErrorDetail = {
  name?: string;
  message?: string;
  /** NeonConfigError's NEON_NOT_CONFIGURED, a Postgres SQLSTATE, a Node errno. */
  code?: string;
  /** Node attaches these to syscall failures; they name the real fault. */
  errno?: string;
  syscall?: string;
  stack?: string;
  cause?: ErrorDetail;
  /** Set instead of the above when something that is not an Error was thrown. */
  thrown?: string;
};

function clamp(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…[truncated]` : value;
}

/** Stringify a `code`/`errno` that may arrive as a number or a symbol. */
function scalar(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return undefined;
}

function describe(error: unknown, depth = 0): ErrorDetail {
  if (error instanceof Error) {
    const extra = error as unknown as Record<string, unknown>;
    const detail: ErrorDetail = {
      name: error.name,
      message: clamp(error.message, MAX_MESSAGE_CHARS),
    };
    const code = scalar(extra.code);
    if (code) detail.code = code;
    const errno = scalar(extra.errno);
    if (errno) detail.errno = errno;
    const syscall = scalar(extra.syscall);
    if (syscall) detail.syscall = syscall;
    // Only the outermost stack: the causes' stacks are nearly identical and
    // would triple the line length for no extra information.
    if (depth === 0 && error.stack) detail.stack = clamp(error.stack, MAX_STACK_CHARS);
    if (error.cause !== undefined && error.cause !== null && depth < MAX_CAUSE_DEPTH) {
      detail.cause = describe(error.cause, depth + 1);
    }
    return detail;
  }

  // Not an Error. Keep it to a string: a thrown object of unknown shape is the
  // other way this function could have blown up on JSON.stringify.
  if (typeof error === "object") {
    try {
      return { thrown: clamp(JSON.stringify(error) ?? String(error), MAX_MESSAGE_CHARS) };
    } catch {
      return { thrown: "[unserialisable object]" };
    }
  }
  return { thrown: clamp(String(error), MAX_MESSAGE_CHARS) };
}

/** Drop anything JSON.stringify would reject or that would bloat the line. A
 *  caller's `meta` is developer-supplied, but it is still not worth crashing a
 *  catch block over. */
function safeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value === null || value === undefined) continue;
    switch (typeof value) {
      case "string":
        out[key] = clamp(value, MAX_MESSAGE_CHARS);
        break;
      case "number":
      case "boolean":
        out[key] = value;
        break;
      case "bigint":
        out[key] = String(value);
        break;
      default:
        // Objects, functions and symbols are skipped rather than walked: a
        // request, a client or a row is exactly what tends to be circular, and
        // exactly what tends to carry a credential.
        break;
    }
  }
  return out;
}

/**
 * Record a server-side failure and return the correlation ref to show the user.
 *
 * Callers that have nothing to show a user can ignore the return value — the
 * signature widened from `void` to `string`, which is source-compatible.
 *
 * NEVER give the returned ref any other meaning, and never put `detail` in a
 * response body. The division of labour is the point: the browser gets four hex
 * characters, the log gets everything.
 */
export function logServerError(
  context: string,
  error: unknown,
  meta?: Record<string, unknown>,
): string {
  const ref = newErrorRef();

  try {
    console.error(
      `${SERVER_ERROR_TAG} ${JSON.stringify({
        level: "error",
        tag: SERVER_ERROR_TAG,
        context,
        ref,
        at: new Date().toISOString(),
        ...describe(error),
        ...safeMeta(meta),
      })}`,
    );
  } catch {
    // Last resort. Something above is still unserialisable; say so on one line
    // rather than letting this module be the reason a request 500s.
    try {
      console.error(
        `${SERVER_ERROR_TAG} {"level":"error","tag":"${SERVER_ERROR_TAG}","context":${JSON.stringify(
          context,
        )},"ref":"${ref}","note":"log record could not be serialised"}`,
      );
    } catch {
      // console itself is gone. Nothing useful remains to be done.
    }
  }

  return ref;
}
