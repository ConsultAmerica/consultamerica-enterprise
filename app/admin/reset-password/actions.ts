"use server";

import { redirect } from "next/navigation";

import { MIN_PASSWORD_LENGTH, WeakPasswordError, setPassword } from "@/lib/neon/admin-users";
import {
  ADMIN_LOGIN_PATH,
  DEFAULT_ADMIN_LANDING,
  type AuthNotice,
  adminLoginUrl,
  claimPasswordResetToken,
  clearSessionCookie,
  clientIp,
  clientUserAgent,
  createSession,
  getSessionUser,
  revokePasswordResetTokens,
  setSessionCookie,
} from "@/lib/neon/auth";
import { logServerError } from "@/lib/observability/logger";

/**
 * Sets a new password, in one of two modes.
 *
 *   TOKEN mode   — a one-time link from the reset email. The token is claimed
 *                  by a single UPDATE that both checks and marks used_at, so a
 *                  replayed or raced link matches zero rows (see
 *                  claimPasswordResetToken).
 *   SESSION mode — no token, but a signed-in admin carrying
 *                  must_change_password. This is the forced change after a
 *                  seeded or administratively reset credential. It is gated on
 *                  that flag alone, which the change itself clears, so the
 *                  route cannot be used as a general "change my password
 *                  without knowing it" endpoint.
 *
 * Either way, success invalidates EVERY session the account holds. After a
 * password change, any session opened with the old password belongs to whoever
 * knew the old password — including the person the reset is meant to evict.
 * Outstanding reset links are voided for the same reason.
 */

const RESET_PATH = "/admin/reset-password";

/** Keeps the token in the URL so a mismatch or a short password can be
 *  corrected without going back to the email. */
function backToForm(notice: AuthNotice, token: string): string {
  const params = new URLSearchParams({ notice });
  if (token) params.set("token", token);
  return `${RESET_PATH}?${params.toString()}`;
}

export async function resetPassword(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  // Not trimmed: spaces are valid password characters.
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password !== confirmPassword) redirect(backToForm("password-mismatch", token));
  if (password.length < MIN_PASSWORD_LENGTH) redirect(backToForm("password-weak", token));

  // Resolved in the try, redirected to after it: `redirect` throws, so a
  // redirect inside the try would be caught below and reported as a failure.
  let next: string;
  try {
    if (token) {
      const adminUserId = await claimPasswordResetToken(token);
      if (!adminUserId) {
        // Expired, already used, never existed, or the account has since been
        // deactivated. One message covers all four.
        next = backToForm("reset-invalid", "");
      } else {
        await setPassword(adminUserId, password);
        await revokePasswordResetTokens(adminUserId);
        // If this browser happened to hold a session for the account, it was
        // just invalidated server-side; drop the dead cookie too.
        await clearSessionCookie();
        next = `${ADMIN_LOGIN_PATH}?notice=reset-done`;
      }
    } else {
      const user = await getSessionUser();
      if (!user || !user.mustChangePassword) {
        // No token and no forced change: there is nothing to authorise a
        // password change here. Self-service goes through the emailed link.
        next = adminLoginUrl();
      } else {
        await setPassword(user.id, password);
        await revokePasswordResetTokens(user.id);
        // setPassword revoked every session, including the one that got here.
        // Issue a fresh one rather than bouncing the user back to a login form
        // they passed thirty seconds ago.
        const fresh = await createSession(user.id, await clientIp(), await clientUserAgent());
        await setSessionCookie(fresh);
        next = DEFAULT_ADMIN_LANDING;
      }
    }
  } catch (error) {
    // Defence in depth: the length check above already covers this, but
    // hashPassword enforces it too and a future caller might not.
    if (error instanceof WeakPasswordError) {
      next = backToForm("password-weak", token);
    } else {
      logServerError("admin-auth/reset-password", error);
      next = backToForm("unavailable", token);
    }
  }

  redirect(next);
}
