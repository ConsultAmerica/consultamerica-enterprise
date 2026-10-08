import type { Metadata } from "next";
import Link from "next/link";

import { signOutOfActivation } from "@/app/actions/candidate-activation";
import { isExplicitDemoMode } from "@/app/lib/supabase/client";
import { getSupabaseServerAuthClient } from "@/app/lib/supabase/auth-server";
import { getSupabaseServiceClient } from "@/app/lib/supabase/server";
import { AccessRequestForm, ClaimRecordForm, HashSessionBridge, SetPasswordForm } from "@/components/candidate/ActivationForms";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { resolveActivation } from "@/lib/candidate-portal/activation";
import { createActivationPorts, currentActivationIdentity } from "@/lib/candidate-portal/activation-supabase";

export const metadata: Metadata = { title: "Activate your candidate account", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ERRORS: Record<string, string> = {
  expired: "That link has expired or was already used. Request a new one below.",
  invalid: "That link isn't valid. Request a new one below.",
};

export default async function ActivatePage({ searchParams }: Props) {
  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : null;
  const demo = isExplicitDemoMode();

  let content: React.ReactNode;
  if (demo) {
    content = (
      <div className="apply-panel">
        <p className="apply-job-meta">Account activation uses Supabase Auth and isn&apos;t available in local demo mode.</p>
        <p style={{ marginTop: 16 }}>
          <Link href="/candidate/login" className="btn btn-primary">Demo sign-in</Link>
        </p>
      </div>
    );
  } else {
    const auth = await getSupabaseServerAuthClient();
    const service = getSupabaseServiceClient();
    const identity = auth && !errorKey ? await currentActivationIdentity(auth) : null;
    const user = identity ? { email: identity.email } : null;
    const state = identity && service ? await resolveActivation(identity, createActivationPorts(service)) : null;

    if (user && state?.kind === "ready") {
      content = (
        <>
          <p className="apply-job-meta">
            Your email is verified. Choose a password to finish activating your account. It will show the applications
            connected to your invitation.
          </p>
          <SetPasswordForm email={user.email ?? ""} />
        </>
      );
    } else if (user && state?.kind === "claimable") {
      content = (
        <>
          <p className="apply-job-meta">
            Your email is verified. We have an earlier application filed under <strong>{user.email}</strong> that
            isn&apos;t connected to an account yet. Connect it to this sign-in to see it in your candidate portal.
          </p>
          <ClaimRecordForm />
        </>
      );
    } else if (user && state?.kind === "claim-needs-fresh-proof") {
      content = (
        <>
          <p className="apply-job-meta">
            To connect an earlier application to this sign-in, we need to confirm you can still open email sent to{" "}
            <strong>{user.email}</strong>. Request a new link below and open it within 15 minutes.
          </p>
          <AccessRequestForm />
        </>
      );
    } else if (user) {
      content = (
        <div className="apply-panel">
          <p className="apply-job-meta" style={{ marginTop: 0 }}>
            This sign-in isn&apos;t connected to a candidate account.
          </p>
          <form action={signOutOfActivation} style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-dark">Sign out</button>
          </form>
        </div>
      );
    } else {
      content = (
        <>
          {errorKey && ERRORS[errorKey] ? (
            <p className="apply-error" role="alert">{ERRORS[errorKey]}</p>
          ) : (
            <p className="apply-job-meta">
              Applied before, or need a new activation or sign-in link? Enter the email address you applied with and
              we&apos;ll send a secure, single-use link to that inbox.
            </p>
          )}
          <AccessRequestForm />
          <HashSessionBridge
            supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
            anonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
          />
        </>
      );
    }
  }

  return (
    <>
      <MarketingHeader />
      <main>
        <div className="apply-page">
          <div className="wrap apply-page-inner cp-login">
            <header className="apply-intro">
              <p className="apply-eyebrow">Candidate portal</p>
              <h1 style={{ fontSize: "clamp(28px, 3.4vw, 38px)" }}>Activate your account</h1>
            </header>
            {content}
            <div className="cp-login-help">
              <p>
                Already activated? <Link href="/candidate/login">Sign in</Link> · <Link href="/jobs">Search open jobs</Link>
              </p>
            </div>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
