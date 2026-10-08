import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/LoginForm";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { sanitizeReturnTo } from "@/lib/auth/return-to";

export const metadata: Metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
};

type LoginPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = sanitizeReturnTo(one(params.returnTo));
  const error = one(params.error) === "forbidden" ? "Your account does not have recruiting access." : null;

  return (
    <>
      <MarketingHeader />
      <main className="jobs-shell">
        <div className="wrap login-page">
          <p className="apply-eyebrow">Consult America</p>
          <h1>Recruiting workspace</h1>
          <p className="login-lead">Sign in with your Consult America staff account.</p>
          <div className="apply-panel">
            <LoginForm returnTo={returnTo} initialError={error} />
          </div>
        </div>
      </main>
    </>
  );
}
