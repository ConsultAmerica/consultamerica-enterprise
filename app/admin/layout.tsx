import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/AdminNav";
import { AdminUserMenu } from "@/components/admin/AdminUserMenu";
import { type AdminRole, getSessionUser } from "@/lib/neon/auth";
import { NeonConfigError, query } from "@/lib/neon/client";

/**
 * Shell for the Neon-backed recruitment admin (/admin/*).
 *
 * WHY THERE IS NO requireAdmin() IN THIS LAYOUT
 *
 * A layout wraps every route in its segment, and three of the routes under
 * /admin must stay reachable while signed out: /admin/login,
 * /admin/forgot-password and /admin/reset-password (the last one is also how a
 * must_change_password account chooses a new password). Calling requireAdmin()
 * here would redirect an anonymous visitor from the login page to the login
 * page — an infinite loop in which nobody can ever sign in. The POST-only
 * /admin/logout route handler shares the prefix too; route handlers have no
 * layout, but it is on the same list of things that must work unauthenticated.
 *
 * A route group ((workspace)) is the textbook alternative, and it was rejected
 * for two concrete reasons. First, the protected pages would have to move into
 * app/admin/(workspace)/, and /admin/jobs, /admin/applications and
 * /admin/candidates are being written right now at their plain paths — a group
 * would quietly leave those pages outside both this shell and the guard, which
 * is a worse failure than a verbose one because it looks fine. Second, it buys
 * nothing: every protected page already awaits the session to render its own
 * data, so calling requireAdmin() there is one line, not a duplicated guard.
 *
 * So the division is: each protected page calls requireAdmin({ returnTo }) and
 * is responsible for its own authorization; this layout only decides whether to
 * draw chrome. getSessionUser() is wrapped in React cache(), so the layout and
 * the page it wraps share a single database round trip rather than two.
 *
 * Chrome is keyed on the session rather than on the path because a server
 * layout cannot see the URL it is rendering — the same limitation documented on
 * requireAdmin() in lib/neon/auth.ts. Signed in: header, nav, identity,
 * sign-out. Not signed in: `children` is returned untouched, which is exactly
 * what the three auth pages want, since each already renders its own
 * MarketingHeader and <main> and would otherwise end up with two headers.
 */
export const metadata: Metadata = {
  title: {
    default: "Recruitment admin · Consult America",
    template: "%s · Recruitment admin · Consult America",
  },
  // Belt and braces: the auth pages set this themselves, but a staff area has
  // nothing to gain from being indexed and everything to lose, so the whole
  // subtree declares it in one place.
  robots: { index: false, follow: false },
};

/**
 * Every page here reads a per-request cookie and live database rows, so none of
 * it can be prerendered. Declaring that explicitly (as app/app/layout.tsx does
 * for the old workspace) keeps `next build` from attempting a static render and
 * failing on cookies() instead.
 */
export const dynamic = "force-dynamic";

/**
 * The signed-in admin, or null when no chrome should be drawn.
 *
 * must_change_password counts as "not signed in" for layout purposes:
 * requireAdmin() sends those accounts to /admin/reset-password and lets them
 * reach nothing else, so a nav bar they cannot use would be a lie.
 *
 * NeonConfigError (DATABASE_URL unset) is swallowed on purpose, so the page
 * underneath can render its own "database not configured" panel rather than
 * this layout turning the entire subtree — login page included — into a 500.
 * Every other database error is re-thrown: getSessionUser() failing closed on
 * an outage is deliberate, and so is not quietly rendering a signed-out shell
 * for someone who may well be signed in.
 */
const ROLE_LABELS: Record<AdminRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  RECRUITER: "Recruiter",
};

/**
 * Applications waiting on a first review, for the badge in the nav.
 *
 * NEW and SCREENING only, the same definition the Recruitment Overview uses,
 * so the badge and the "Needs review" card can never disagree. An application
 * at interview or offer is mid-process with dates in the diary; counting it as
 * unreviewed would inflate the one number that is supposed to mean "nobody has
 * looked at this yet".
 *
 * RETURNS NULL ON ANY FAILURE, AND NULL IS NOT ZERO. A nav that renders "0"
 * during a database outage tells a recruiter there is no work waiting, and
 * that is a wrong answer somebody acts on. No number means no claim. One
 * indexed COUNT per page load is a fair price for a figure that is visible
 * from every screen.
 */
async function reviewCount(): Promise<number | null> {
  try {
    const rows = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM applications WHERE status = ANY($1::text[])`,
      [["NEW", "SCREENING"]],
    );
    return rows[0]?.n ?? null;
  } catch {
    return null;
  }
}

async function chromeUser() {
  try {
    const user = await getSessionUser();
    return user && !user.mustChangePassword ? user : null;
  } catch (error) {
    if (error instanceof NeonConfigError) return null;
    throw error;
  }
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await chromeUser();

  if (!user) {
    return <>{children}</>;
  }

  const waiting = await reviewCount();

  return (
    /*
      A LEFT RAIL, NOT A TOP BAR.

      The top bar was already carrying four sections and had nowhere to put a
      fifth: every new destination competed for the same horizontal strip with
      the brand and the account menu. A rail is the shape Linear, Stripe,
      Vercel and every other tool of this kind converged on, and for a reason
      that is structural rather than fashionable. Vertical space is the thing
      an admin has spare. It takes more sections without crowding, it has room
      for a count beside a label instead of a badge squeezed into a tab, and it
      hands the entire top edge of the page back to the thing the page is
      actually about.

      Dark rail against a light workspace. The contrast does the separating, so
      navigation never has to compete with content for attention, and the
      palette is the one the old bar already used rather than a new one.
    */
    <div className="ws adm-shell">
      <aside className="sb" aria-label="Recruitment admin">
        <Link href="/admin/dashboard" className="sb-brand">
          {/* Same mark and cache-buster as the marketing header, so the
              admin and the site read as one company, not two products. */}
          <img src="/logo-mark3.png?v=m1" alt="" aria-hidden />
          <span className="sb-brand-text">
            <span className="sb-brand-name">Consult America</span>
            <span className="sb-brand-tag">Recruiting</span>
          </span>
        </Link>

        {/* The badge count is read per request and passed down: AdminNav is
            a client component and must not query anything itself. */}
        <AdminNav reviewCount={waiting} />

        {/*
          The account sits at the foot of the rail, which is where every tool
          of this shape puts it. It is the control a person uses least and
          needs to find instantly, and the bottom corner is the one place on
          screen that never moves as content grows.
        */}
        <div className="sb-foot">
          <AdminUserMenu
            fullName={user.fullName}
            email={user.email}
            roleLabel={ROLE_LABELS[user.role]}
          />
        </div>
      </aside>
      {/*
        THE CONTRACT WITH THE PAGES: the shell owns <main className="ws-main">,
        so a signed-in page returns a fragment and never opens a <main> of its
        own — the same split app/app/layout.tsx uses for the old workspace. Two
        nested <main> elements would give a screen reader two "main" landmarks
        and apply this container's max-width and padding twice.

        The one exception, which every page under /admin implements the same
        way: a branch that can only be reached when there is no session (the
        "database not configured" panel) carries its own .ws and .ws-main,
        because in that state this layout rendered `children` bare.
      */}
      <main className="ws-main">{children}</main>
    </div>
  );
}
