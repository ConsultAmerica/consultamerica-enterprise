/**
 * Choose a new admin password.
 *
 * Two ways in, both handled here (see app/admin/reset-password/actions.ts for
 * the matching halves):
 *
 *   ?token=...  a one-time link from the reset email. The token is checked for
 *               validity on render — WITHOUT consuming it — so a link that has
 *               expired or already been used says so immediately rather than
 *               after the user has typed a new password twice.
 *   no token    a signed-in admin whose account carries must_change_password,
 *               i.e. the forced change after a seeded or reset credential.
 *
 * This page reads getSessionUser() directly instead of calling requireAdmin().
 * requireAdmin() sends anyone with must_change_password here, so calling it
 * from this page would redirect to itself forever.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MIN_PASSWORD_LENGTH } from "@/lib/neon/admin-users";
import { AUTH_NOTICES, getSessionUser, isAuthNotice, isPasswordResetTokenUsable } from "@/lib/neon/auth";

import { resetPassword } from "./actions";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminResetPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const noticeKey = one(params.notice);
  const notice = isAuthNotice(noticeKey) ? AUTH_NOTICES[noticeKey] : null;
  const token = (one(params.token) ?? "").trim();

  const tokenUsable = token ? await isPasswordResetTokenUsable(token) : false;

  // Session mode is only consulted when there is no token, so a stale cookie
  // can never turn a dead link into a working form.
  const forcedChangeUser = token ? null : await getSessionUser();
  if (!token && !forcedChangeUser?.mustChangePassword) {
    // Nothing authorises a password change: no link, and no account waiting to
    // be forced through one. Self-service starts at the forgot-password form.
    redirect("/admin/forgot-password");
  }

  const canSubmit = tokenUsable || !!forcedChangeUser?.mustChangePassword;

  return (
    <>
      <MarketingHeader />
      <main className="jobs-shell">
        <div className="wrap login-page">
          <p className="apply-eyebrow">Consult America</p>
          <h1>Choose a new password</h1>
          <p className="login-lead">
            {!canSubmit
              ? "This link cannot be used."
              : forcedChangeUser?.mustChangePassword
                ? `Your account needs a new password before you can continue, ${forcedChangeUser.fullName}.`
                : "Pick something you do not use anywhere else."}
          </p>
          <div className="apply-panel">
            {notice ? (
              <p className={notice.tone === "error" ? "apply-error" : "ws-flash ok"} role="alert">
                {notice.message}
              </p>
            ) : null}

            {canSubmit ? (
              <>
                <form action={resetPassword} className="login-form" noValidate>
                  {token ? <input type="hidden" name="token" value={token} /> : null}
                  <div className="apply-field">
                    <label htmlFor="admin-new-password">New password</label>
                    <input
                      id="admin-new-password"
                      type="password"
                      name="password"
                      autoComplete="new-password"
                      minLength={MIN_PASSWORD_LENGTH}
                      required
                    />
                  </div>
                  <div className="apply-field">
                    <label htmlFor="admin-confirm-password">Confirm new password</label>
                    <input
                      id="admin-confirm-password"
                      type="password"
                      name="confirmPassword"
                      autoComplete="new-password"
                      minLength={MIN_PASSWORD_LENGTH}
                      required
                    />
                  </div>
                  <div className="apply-actions apply-actions-end">
                    <button type="submit" className="btn btn-primary">
                      Save password
                    </button>
                  </div>
                </form>
                <p className="apply-trust">
                  At least {MIN_PASSWORD_LENGTH} characters. Saving signs you out of every other
                  browser and device.
                </p>
              </>
            ) : (
              /* Token mode with an unusable token. The copy covers expired,
                 already used and never valid without distinguishing them. */
              <p className="apply-trust">
                That reset link is no longer valid. Links expire after an hour and can only be used
                once.
                <br />
                <Link href="/admin/forgot-password">Request a new link</Link>
                {" · "}
                <Link href="/admin/login">Back to sign in</Link>
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
