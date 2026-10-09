"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";

import { adminEmailOrigin, sendAdminPasswordResetEmail } from "@/lib/email/admin-emails";
import { findByEmail, normalizeEmail } from "@/lib/neon/admin-users";
import {
  RESET_REQUEST_RATE_LIMIT,
  RESET_TTL_SECONDS,
  clientIp,
  consumeRateLimit,
  createPasswordResetToken,
  rateLimitBucket,
} from "@/lib/neon/auth";
import { logServerError } from "@/lib/observability/logger";

/**
 * "Forgot password" for admin accounts.
 *
 * The answer is always the same: "If that address has an account, we have sent
 * a reset link." Unknown address, known address, deactivated account, mail
 * provider down — one response. The reasoning is the same as on the sign-in
 * form: a form that confirms whether an address belongs to a Consult America
 * administrator is a free directory lookup for anyone preparing a phishing or
 * credential-stuffing run, and "we don't have that email" is exactly that
 * lookup.
 *
 * The identical wording is not enough on its own, because the work only
 * happens when the account is real: a token insert plus a call to Resend takes
 * a few hundred milliseconds, and an attacker with a stopwatch can read that
 * difference as easily as a different sentence. So every bit of it runs inside
 * `after()`, which Next executes once the response has already been sent. Both
 * cases return in the same few milliseconds and the response carries no signal
 * at all.
 */

const FORGOT_PATH = "/admin/forgot-password";

/** Shape check only. Address validity is never confirmed to the caller. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));

  // Rejecting a malformed address is not an enumeration oracle: a string that
  // is not an email address cannot belong to anybody, so pointing out the typo
  // reveals nothing and saves the user a pointless wait for an email.
  if (!EMAIL_SHAPE.test(email)) redirect(`${FORGOT_PATH}?notice=email-invalid`);

  /**
   * Two buckets. The email bucket stops one inbox being flooded by repeated
   * submissions of the same address; the IP bucket stops a script walking a
   * list of addresses from one place. Being throttled produces the SAME
   * response as succeeding — telling the caller they have been rate-limited
   * would reintroduce a signal, and anyone legitimately hitting five requests
   * in an hour already has a link waiting in their inbox.
   */
  const ip = await clientIp();
  const withinLimits =
    consumeRateLimit(rateLimitBucket("admin-reset-email", email), RESET_REQUEST_RATE_LIMIT) &&
    consumeRateLimit(rateLimitBucket("admin-reset-ip", ip), RESET_REQUEST_RATE_LIMIT);

  if (withinLimits) {
    after(async () => {
      try {
        const user = await findByEmail(email);
        // A deactivated admin must not be able to reset their way back in.
        if (!user || !user.isActive) return;

        // Raw token for the link; only its SHA-256 is stored. Never logged.
        const token = await createPasswordResetToken(user.id);
        const resetUrl = `${adminEmailOrigin()}/admin/reset-password?token=${token}`;

        await sendAdminPasswordResetEmail({
          to: user.email,
          fullName: user.fullName,
          resetUrl,
          expiresAt: new Date(Date.now() + RESET_TTL_SECONDS * 1000),
          adminUserId: user.id,
        });
      } catch (error) {
        // The response has already gone out; all this can do is leave a trace
        // for whoever investigates "I never got the email".
        logServerError("admin-auth/forgot-password", error);
      }
    });
  }

  redirect(`${FORGOT_PATH}?notice=reset-sent`);
}
