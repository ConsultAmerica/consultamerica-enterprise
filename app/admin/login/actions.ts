"use server";

import { redirect } from "next/navigation";

import { findByEmail, normalizeEmail, recordLogin, verifyPassword } from "@/lib/neon/admin-users";
import {
  ADMIN_LOGIN_PATH,
  DEFAULT_ADMIN_LANDING,
  LOGIN_RATE_LIMIT,
  type AuthNotice,
  clientIp,
  clientUserAgent,
  consumeRateLimit,
  createSession,
  rateLimitBucket,
  releaseRateLimit,
  sanitizeAdminReturnTo,
  setSessionCookie,
} from "@/lib/neon/auth";
import { connectionStringStatus } from "@/lib/neon/client";
import { logServerError } from "@/lib/observability/logger";

/**
 * Admin sign-in against admin_users in Neon.
 *
 * Post/redirect/get rather than useActionState: the page stays a server
 * component (so it can keep `robots: noindex` metadata and needs no client
 * bundle), the form works with JavaScript disabled, and a refresh after a
 * failure re-renders the page instead of re-posting the password. The failure
 * reason travels as a `notice` code, which has a useful side effect — the
 * browser only ever learns one of a fixed set of codes, so a new failure
 * branch cannot accidentally invent a new, more revealing message.
 *
 * Note for anyone adding a branch: the three credential failures (unknown
 * email, wrong password, deactivated account) must all end at the `invalid`
 * code. See SIGN_IN_FAILURE in lib/neon/auth.ts for why.
 */

/** Rebuilds the login URL, preserving returnTo and the typed email so a
 *  mistyped password does not cost the user the rest of the form.
 *
 *  `ref` is the correlation id from logServerError, set only on the
 *  `unavailable` branch. It is four hex characters identifying a log record and
 *  nothing else — see noticeFor() in lib/neon/auth.ts for why that is safe to
 *  put in front of an anonymous visitor. */
function backToLogin(
  notice: AuthNotice,
  returnTo: string | null,
  email: string,
  ref?: string,
): string {
  const params = new URLSearchParams({ notice });
  if (returnTo) params.set("returnTo", returnTo);
  if (email) params.set("email", email);
  if (ref) params.set("ref", ref);
  return `${ADMIN_LOGIN_PATH}?${params.toString()}`;
}

/**
 * The steps inside the try, in order, so a failure can name the one it died in.
 *
 * This is here because the alternative is what this action shipped with: a
 * single catch covering a database read, a bcrypt comparison, a session insert,
 * a cookie write and a bookkeeping update, all collapsing to one string. The
 * stage is recorded in the log line next to the exception, which turns "sign-in
 * is broken" into "sign-in cannot reach the database" or "sign-in cannot write
 * its cookie" without a redeploy or a bisect. It is logged, never returned: the
 * browser still only ever learns the `unavailable` code.
 */
type SignInStage = "lookup" | "verify-password" | "create-session" | "set-cookie";

export async function signIn(formData: FormData): Promise<void> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  // Not trimmed: leading and trailing spaces are legitimate password
  // characters, and silently stripping them locks out whoever used them.
  const password = String(formData.get("password") ?? "");
  const returnTo = sanitizeAdminReturnTo(formData.get("returnTo") as string | null);

  // Nothing was submitted: no lookup happened, so saying so reveals nothing
  // about any account.
  if (!email || !password) redirect(backToLogin("missing", returnTo, email));

  /**
   * Counted per (email + IP) and counted BEFORE the lookup, so the counter
   * moves identically whether or not the address exists — a limiter that only
   * counted real accounts would itself be the enumeration oracle this whole
   * flow is built to avoid.
   */
  const ip = await clientIp();
  const bucket = rateLimitBucket("admin-login", email, ip);
  if (!consumeRateLimit(bucket, LOGIN_RATE_LIMIT)) {
    redirect(backToLogin("throttled", returnTo, email));
  }

  // Resolved inside the try, redirected to outside it: `redirect` works by
  // throwing, so a redirect inside the try would be caught by the catch below
  // and turned into a spurious "unavailable".
  let next: string;
  let stage: SignInStage = "lookup";
  try {
    const user = await findByEmail(email);

    // Always one bcrypt comparison, even with no user: verifyPassword falls
    // back to a dummy hash. The isActive test comes after it for the same
    // reason — checking it first would let a deactivated account answer
    // faster than an active one and leak that the address is real.
    stage = "verify-password";
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? null);

    if (!user || !passwordOk || !user.isActive) {
      // The specific reason is recorded server-side, where it is useful for
      // spotting an attack, and discarded on the way to the browser.
      console.warn(
        JSON.stringify({
          level: "warn",
          context: "admin-auth/sign-in",
          event: "rejected",
          reason: !user ? "unknown-email" : !passwordOk ? "bad-password" : "inactive-account",
          adminUserId: user?.id ?? null,
          at: new Date().toISOString(),
        }),
      );
      next = backToLogin("invalid", returnTo, email);
    } else {
      stage = "create-session";
      const token = await createSession(user.id, ip, await clientUserAgent());
      stage = "set-cookie";
      await setSessionCookie(token);
      // Correct credentials clear the counter, so an admin who fumbles their
      // password four times is not throttled for the rest of the window.
      releaseRateLimit(bucket);
      // Stamping last_login_at is bookkeeping; failing to write it must not
      // undo a sign-in that has already succeeded.
      await recordLogin(user.id).catch((error: unknown) =>
        logServerError("admin-auth/record-login", error, { adminUserId: user.id }),
      );

      next = user.mustChangePassword
        ? // A seeded or reset credential: the forced change comes before
          // anything else, including an explicit returnTo.
          "/admin/reset-password"
        : (returnTo ?? DEFAULT_ADMIN_LANDING);
    }
  } catch (error) {
    /**
     * A Neon outage or a missing DATABASE_URL. Fails closed (no session) and
     * says nothing about whether the address exists.
     *
     * THE THREE FACTS RECORDED HERE, AND WHY EACH ONE IS WORTH A FIELD. This
     * branch used to log the exception alone, which made a sign-in that failed
     * only on Vercel — identical code, identical database, working perfectly on
     * localhost — a guessing game. These are what end it:
     *
     *   stage           which of the four steps threw, so the search starts in
     *                   the right file instead of in all of them.
     *   dbConfigured    whether a connection string was present AT ALL in this
     *                   runtime. A boolean, never the value. This is the field
     *                   that separates "the database is down" from "this
     *                   deployment was never given a database", and those two
     *                   have completely different fixes — one is wait, the
     *                   other is set an environment variable and redeploy.
     *                   It is also the field that, had it existed, would have
     *                   answered the original incident in one request: the
     *                   production deployment had neither DATABASE_URL nor
     *                   POSTGRES_URL set, so requireConnectionString() threw
     *                   NeonConfigError on the very first query.
     *   ref             the four characters the user is about to be shown, so
     *                   their report points at this exact line.
     *
     * Not recorded: the email, the password, the connection string, the
     * session token. The email is already in the redirect the user can see, so
     * it adds nothing to the log; the rest are credentials.
     */
    const { present: dbConfigured } = connectionStringStatus();
    const ref = logServerError("admin-auth/sign-in", error, { stage, dbConfigured });
    next = backToLogin("unavailable", returnTo, email, ref);
  }

  redirect(next);
}
