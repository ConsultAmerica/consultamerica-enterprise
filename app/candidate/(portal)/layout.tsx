import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

import { candidateLogout } from "@/app/actions/candidate-portal";
import { CandidateNav } from "@/components/candidate/CandidateNav";
import { CANDIDATE_RETURN_PREFIXES, sanitizeReturnTo } from "@/lib/auth/return-to";
import { PORTAL_PATH_HEADER } from "@/lib/candidate-portal/paths";
import { requireCandidate } from "@/lib/candidate-portal/session";

export const metadata: Metadata = {
  title: { default: "Candidate portal", template: "%s · Candidate portal · Consult America" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CandidatePortalLayout({ children }: { children: ReactNode }) {
  const path = sanitizeReturnTo((await headers()).get(PORTAL_PATH_HEADER), CANDIDATE_RETURN_PREFIXES);
  const session = await requireCandidate(path ?? "/candidate");
  return (
    <div className="ws cp">
      <header className="ws-bar">
        <div className="ws-bar-inner">
          <Link href="/" className="ws-brand">
            <img src="/logo-mark3.png?v=m1" alt="" aria-hidden />
            Consult America <small>Candidate</small>
          </Link>
          <CandidateNav />
          <div className="ws-user">
            <span className="cp-user-name">
              {session.displayName}
              {session.demo ? " (local demo)" : ""}
            </span>
            <form action={candidateLogout}>
              <button type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="ws-main">{children}</main>
    </div>
  );
}
