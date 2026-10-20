/**
 * "Forgot password" for admin accounts.
 *
 * Same chrome and the same classes as /admin/login, because it is the same
 * moment in the same flow. Server component with a post/redirect/get form for
 * the reasons given in app/admin/login/page.tsx.
 *
 * The confirmation is shown for every well-formed address, whether or not it
 * belongs to an account — see app/admin/forgot-password/actions.ts.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { redirect } from "next/navigation";

import { AUTH_NOTICES, DEFAULT_ADMIN_LANDING, isAuthNotice, signedInAdmin } from "@/lib/neon/auth";

import { requestPasswordReset } from "./actions";

export const metadata: Metadata = {
  title: "Reset admin password",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminForgotPasswordPage({ searchParams }: Props) {
  const params = await searchParams;

  // Already signed in: the admin layout would wrap this page in its rail, and
  // the page's own marketing header would land on top of it. There is nothing
  // to sign in to, so go where the admin was heading.
  if (await signedInAdmin()) redirect(DEFAULT_ADMIN_LANDING);
  const noticeKey = one(params.notice);
  const notice = isAuthNotice(noticeKey) ? AUTH_NOTICES[noticeKey] : null;
  // Once the confirmation is showing there is nothing useful left to do on
  // this page, so the form is replaced rather than left inviting a resubmit.
  const sent = noticeKey === "reset-sent";

  return (
    <>
      {/* Staff sign-in shows only the form: no public site navigation. */}
      <main className="jobs-shell adm-auth">
        <div className="wrap login-page">
          <p className="apply-eyebrow">Consult America</p>
          <h1>Reset your password</h1>
          <p className="login-lead">
            {sent
              ? "Check your inbox for the next step."
              : "Enter the email address on your admin account and we will send you a link."}
          </p>
          <div className="apply-panel">
            {notice ? (
              <p className={notice.tone === "error" ? "apply-error" : "ws-flash ok"} role="alert">
                {notice.message}
              </p>
            ) : null}

            {sent ? (
              <p className="apply-trust">
                The link can be used once and stops working after an hour. If nothing arrives, check
                your spam folder, then try again.
                <br />
                <Link href="/admin/login">Back to sign in</Link>
              </p>
            ) : (
              <>
                <form action={requestPasswordReset} className="login-form" noValidate>
                  <div className="apply-field">
                    <label htmlFor="admin-reset-email">Email</label>
                    <input
                      id="admin-reset-email"
                      type="email"
                      name="email"
                      autoComplete="username"
                      required
                    />
                  </div>
                  <div className="apply-actions apply-actions-end">
                    <button type="submit" className="btn btn-primary">
                      Send reset link
                    </button>
                  </div>
                </form>
                <p className="apply-trust">
                  <Link href="/admin/login">Back to sign in</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
