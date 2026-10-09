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
 *  mistyped password does not cost the user the rest of the form. */
function backToLogin(notice: AuthNotice, returnTo: string | null, email: string): string {
  const params = new URLSearchParams({ notice });
  if (returnTo) params.set("returnTo", returnTo);
  if (email) params.set("email", email);
  return `${ADMIN_LOGIN_PATH}?${params.toString()}`;
}

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
  try {
    const user = await findByEmail(email);

    // Always one bcrypt comparison, even with no user: verifyPassword falls
    // back to a dummy hash. The isActive test comes after it for the same
    // reason — checking it first would let a deactivated account answer
    // faster than an active one and leak that the address is real.
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
      const token = await createSession(user.id, ip, await clientUserAgent());
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
    // A Neon outage or a missing DATABASE_URL. Fails closed (no session) and
    // says nothing about whether the address exists.
    logServerError("admin-auth/sign-in", error);
    next = backToLogin("unavailable", returnTo, email);
  }

  redirect(next);
}
