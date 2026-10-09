/**
 * Admin sign-in for the Neon-backed recruitment system.
 *
 * This file used to be a 308 redirect to /login (the Supabase staff sign-in,
 * which still exists and still works for /app/recruiting). It is now a real
 * page: /admin/* is its own system with its own user table, its own session
 * cookie and its own guard (lib/neon/auth.ts). The old sign-in is untouched.
 *
 * OPERATIONAL NOTE: because the previous version answered with a *permanent*
 * redirect, browsers that visited /admin/login before this change will keep
 * sending themselves to /login from cache until that entry expires. A hard
 * reload or a fresh profile clears it.
 *
 * Deliberately a server component. The form posts to a server action and the
 * result comes back as a `?notice=` code (post/redirect/get), which keeps the
 * `robots: noindex` metadata below possible, ships no client JavaScript for
 * the sign-in itself, and means the form still works with scripting disabled.
 *
 * The markup reuses the classes the staff sign-in already uses — `jobs-shell`,
 * `wrap login-page`, `apply-eyebrow`, `login-lead`, `apply-panel`,
 * `apply-field`, `apply-error`, `apply-trust`, `btn btn-primary` — so this is
 * the same page as app/login/page.tsx wearing a different label, not a second
 * design language.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { noticeFor, sanitizeAdminReturnTo } from "@/lib/neon/auth";

import { signIn } from "./actions";

export const metadata: Metadata = {
  title: "Admin sign in",
  // A staff login has nothing to offer a search engine and everything to lose
  // by being indexed.
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminLoginPage({ searchParams }: Props) {
  const params = await searchParams;

  // `ref` is the correlation id the sign-in action attaches when it logged an
  // exception, and noticeFor appends it to the copy as "(ref: a3f9)" so the
  // administrator can quote something that finds the log line. It is validated
  // there against four lowercase hex characters before being interpolated —
  // this value comes out of the query string, so an unchecked one would let
  // anyone put their own text inside our error panel.
  const notice = noticeFor(one(params.notice), one(params.ref));
  // Re-sanitized here as well as in the action. The value in the URL is
  // attacker-supplied, and it is about to be written into a form field that
  // the action will read back.
  const returnTo = sanitizeAdminReturnTo(one(params.returnTo));
  // Echoed back so a wrong password does not cost the user their email. React
  // escapes it; the length cap stops an oversized URL being reflected.
  const email = (one(params.email) ?? "").slice(0, 254);

  return (
    <>
      <MarketingHeader />
      <main className="jobs-shell">
        <div className="wrap login-page">
          <p className="apply-eyebrow">Consult America</p>
          <h1>Recruitment admin</h1>
          <p className="login-lead">Sign in with your Consult America admin account.</p>
          <div className="apply-panel">
            <form action={signIn} className="login-form" noValidate>
              {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
              <div className="apply-field">
                <label htmlFor="admin-email">Email</label>
                <input
                  id="admin-email"
                  type="email"
                  name="email"
                  autoComplete="username"
                  defaultValue={email}
                  required
                />
              </div>
              <div className="apply-field">
                <label htmlFor="admin-password">Password</label>
                <input
                  id="admin-password"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {notice ? (
                <p className={notice.tone === "error" ? "apply-error" : "ws-flash ok"} role="alert">
                  {notice.message}
                </p>
              ) : null}
              <div className="apply-actions apply-actions-end">
                <button type="submit" className="btn btn-primary">
                  Sign in
                </button>
              </div>
            </form>
            <p className="apply-trust">
              <Link href="/admin/forgot-password">Forgotten your password?</Link>
              <br />
              Accounts are created by a Consult America administrator. There is no self sign-up.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
