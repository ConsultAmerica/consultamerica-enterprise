import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { isExplicitDemoMode } from "@/app/lib/supabase/client";
import { CandidateLoginForm } from "@/components/candidate/CandidateLoginForm";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { CANDIDATE_RETURN_PREFIXES, sanitizeReturnTo } from "@/lib/auth/return-to";
import { getCandidateSession } from "@/lib/candidate-portal/session";

export const metadata: Metadata = {
  title: "Candidate sign-in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CandidateLoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const returnTo = sanitizeReturnTo(raw, CANDIDATE_RETURN_PREFIXES);
  if (await getCandidateSession()) redirect(returnTo ?? "/candidate");

  return (
    <>
      <MarketingHeader />
      <main>
        <div className="apply-page">
          <div className="wrap apply-page-inner cp-login">
            <header className="apply-intro">
              <p className="apply-eyebrow">Candidate portal</p>
              <h1 style={{ fontSize: "clamp(28px, 3.4vw, 38px)" }}>Sign in to your applications</h1>
              <p className="apply-job-meta">
                Track applications, manage your résumés and continue saved Detailed Apply drafts.
              </p>
            </header>
            <CandidateLoginForm returnTo={returnTo} demo={isExplicitDemoMode()} />
            <div className="cp-login-help">
              <p>
                <strong>No account yet?</strong> You don&apos;t need one to apply. After your first application we email
                you a secure link to set a password, which connects this portal to your applications.
              </p>
              <p>
                Applied before, lost your link or forgot your password?{" "}
                <Link href="/candidate/activate">Email me a secure link</Link>
              </p>
              <p>
                <Link href="/jobs">Search open jobs</Link> · Consult America staff?{" "}
                <Link href="/login">Use the staff sign-in</Link>
              </p>
            </div>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
