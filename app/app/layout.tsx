import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { logout } from "@/app/actions/auth";
import { WorkspaceNav } from "@/components/workspace/WorkspaceNav";
import { requireRecruitingStaff } from "@/lib/auth/recruiting";

export const metadata: Metadata = {
  title: { default: "Recruiting", template: "%s · Recruiting · Consult America" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const actor = await requireRecruitingStaff();
  return (
    <div className="ws">
      <header className="ws-bar">
        <div className="ws-bar-inner">
          <Link href="/app/recruiting" className="ws-brand">
            <img src="/logo-mark3.png?v=m1" alt="" aria-hidden />
            Consult America <small>Recruiting</small>
          </Link>
          <WorkspaceNav />
          <div className="ws-user">
            <span>
              {actor.displayName}
              {actor.demo ? " (local demo)" : ""}
            </span>
            {actor.demo ? null : (
              <form action={logout}>
                <button type="submit">Sign out</button>
              </form>
            )}
          </div>
        </div>
      </header>
      <main className="ws-main">{children}</main>
    </div>
  );
}
