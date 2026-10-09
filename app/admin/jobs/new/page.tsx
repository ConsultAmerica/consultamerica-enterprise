import type { Metadata } from "next";
import Link from "next/link";

import { AdminJobForm } from "@/components/admin/AdminJobForm";
import { requireAdmin } from "@/lib/neon/auth";
import { NeonConfigError } from "@/lib/neon/client";

import { createJobAction } from "../actions";

/**
 * Create a job by hand.
 *
 * This file used to be a 307 redirect to /app/recruiting/jobs/new, the Supabase
 * workspace form. That form is untouched and still works; this is the create
 * screen for the separate Neon-backed system, whose jobs table stores
 * department and location as plain TEXT rather than as foreign keys — so there
 * are no lookup tables to load before the form can be rendered, and this page
 * reads nothing at all.
 *
 * The page is a server component; AdminJobForm is the client half, because
 * showing a failed save inline without losing what was typed needs client state.
 *
 * Returns a fragment: app/admin/layout.tsx supplies the signed-in chrome and
 * the <main className="ws-main"> wrapper.
 */

export const metadata: Metadata = {
  title: "New job",
  robots: { index: false, follow: false },
};

/** Reads the session cookie, so it can never be prerendered anyway. Stated
 *  explicitly to match the rest of /admin/jobs. */
export const dynamic = "force-dynamic";

export default async function AdminNewJobPage() {
  // The only thing this page loads. Wrapped so an unset DATABASE_URL explains
  // itself instead of 500-ing on the session lookup; redirect() from
  // requireAdmin is a throw too, and must keep propagating.
  try {
    await requireAdmin({ returnTo: "/admin/jobs/new" });
  } catch (error) {
    if (error instanceof NeonConfigError) {
      // Carries its own .ws / .ws-main: reaching this branch means
      // app/admin/layout.tsx hit the same missing variable reading the session,
      // drew no chrome, and passed `children` through bare.
      return (
        <div className="ws">
          <main className="ws-main">
            <div className="ws-head">
              <div>
                <p className="ws-eyebrow">Consult America admin</p>
                <h1>New job</h1>
              </div>
            </div>
            <section className="ws-panel adm-config" role="alert">
              <h2>The recruitment database is not configured</h2>
              <p>
                <code>DATABASE_URL</code> is unset, so a new job could not be saved anywhere. Point{" "}
                <code>DATABASE_URL</code> (or <code>POSTGRES_URL</code>) at the Neon pooled
                connection string — in <code>.env.local</code> for local development, or in the
                Vercel project environment variables — then reload. The form is withheld on
                purpose: offering it would invite someone to type out a full job description and
                lose it on submit.
              </p>
              <p className="adm-config-detail">{error.message}</p>
            </section>
          </main>
        </div>
      );
    }
    throw error;
  }

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">
            <Link href="/admin/jobs">Jobs</Link> · New
          </p>
          <h1>New job</h1>
          <p>
            Everything here is typed in by hand. Saving creates a draft, which is internal; the job
            reaches the public careers page only when it is published.
          </p>
        </div>
      </div>

      <AdminJobForm mode="create" action={createJobAction} cancelHref="/admin/jobs" />
    </>
  );
}
