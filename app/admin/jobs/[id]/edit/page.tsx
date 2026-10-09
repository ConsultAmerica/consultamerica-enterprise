import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminJobForm, type AdminJobFormValues } from "@/components/admin/AdminJobForm";
import { requireAdmin } from "@/lib/neon/auth";
import { NeonConfigError } from "@/lib/neon/client";
import { getJobById } from "@/lib/neon/jobs";
import type { JobRow } from "@/lib/neon/types";

import { updateJobAction } from "../../actions";

/**
 * Edit a job.
 *
 * Editing changes text and details only. It never changes status: a job's
 * publication state moves through the explicit Publish / Unpublish / Archive
 * actions, so correcting a typo in a live posting cannot take it off the site
 * and saving a draft cannot put one up. That is why there is no publishNow
 * checkbox in edit mode.
 *
 * Available at every status, including ARCHIVED — fixing an error in a record
 * must not require putting the job back on the public site first.
 *
 * Returns a fragment: app/admin/layout.tsx supplies the signed-in chrome and
 * the <main className="ws-main"> wrapper. The "database not configured" branch
 * is the exception, for the reason noted at that branch.
 */

export const metadata: Metadata = {
  title: "Edit job",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/**
 * Row to form shape: strings and newline-joined lists, never a number inside an
 * optional, so the conversion happens once here instead of inline at every
 * input. A null salary becomes "" rather than "0" — "not stated" and "zero" are
 * different claims about pay.
 */
function toFormValues(job: JobRow): AdminJobFormValues {
  return {
    id: job.id,
    title: job.title,
    department: job.department,
    location: job.location,
    workplaceType: job.workplace_type,
    employmentType: job.employment_type,
    experienceLevel: job.experience_level ?? "",
    salaryMin: job.salary_min === null ? "" : String(job.salary_min),
    salaryMax: job.salary_max === null ? "" : String(job.salary_max),
    salaryCurrency: job.salary_currency,
    description: job.description,
    responsibilities: job.responsibilities.join("\n"),
    requirements: job.requirements.join("\n"),
    benefits: job.benefits.join("\n"),
    // <input type="date"> accepts yyyy-mm-dd only. The stored instant is the
    // end of the closing day in UTC, so the UTC date is the one to show —
    // toISOString, not a locale conversion that could land a day earlier.
    applicationDeadline: job.application_deadline
      ? job.application_deadline.toISOString().slice(0, 10)
      : "",
  };
}

type LoadResult = { ok: true; job: JobRow | null } | { ok: false; configError: string };

async function load(id: string): Promise<LoadResult> {
  try {
    await requireAdmin({ returnTo: `/admin/jobs/${id}/edit` });
    return { ok: true, job: await getJobById(id) };
  } catch (error) {
    if (error instanceof NeonConfigError) {
      return { ok: false, configError: error.message };
    }
    // requireAdmin's redirect, and anything genuinely unexpected.
    throw error;
  }
}

export default async function AdminEditJobPage({ params }: Props) {
  const { id } = await params;
  const loaded = await load(id);

  if (!loaded.ok) {
    // Carries its own .ws / .ws-main: reaching this branch means
    // app/admin/layout.tsx hit the same missing variable reading the session,
    // drew no chrome, and passed `children` through bare.
    return (
      <div className="ws">
        <main className="ws-main">
          <div className="ws-head">
            <div>
              <p className="ws-eyebrow">
                <Link href="/admin/jobs">Jobs</Link> · Edit
              </p>
              <h1>Edit job</h1>
            </div>
          </div>
          <section className="ws-panel adm-config" role="alert">
            <h2>The recruitment database is not configured</h2>
            <p>
              <code>DATABASE_URL</code> is unset, so this job could not be loaded and an edit could
              not be saved. Point <code>DATABASE_URL</code> (or <code>POSTGRES_URL</code>) at the
              Neon pooled connection string — in <code>.env.local</code> for local development, or
              in the Vercel project environment variables — then reload. The form is withheld
              rather than shown empty, because an empty form here would save over the real job.
            </p>
            <p className="adm-config-detail">{loaded.configError}</p>
          </section>
        </main>
      </div>
    );
  }

  if (!loaded.job) notFound();

  const job = loaded.job;

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">
            <Link href="/admin/jobs">Jobs</Link> ·{" "}
            <Link href={`/admin/jobs/${job.id}`}>{job.reference}</Link> · Edit
          </p>
          <h1>Edit {job.title}</h1>
          <p>
            Saving updates the wording and details. It does not publish, unpublish or archive the
            job, and it does not change the public address <code>/jobs/{job.slug}</code> — that was
            fixed when the job was created so shared links keep working.
          </p>
        </div>
      </div>

      {/* The action is passed in rather than imported by the form, so one
          component serves both create and edit and the two screens cannot
          drift apart. The hidden `id` field in edit mode is what tells
          updateJobAction which row to write. */}
      <AdminJobForm
        mode="edit"
        action={updateJobAction}
        initial={toFormValues(job)}
        cancelHref={`/admin/jobs/${job.id}`}
      />
    </>
  );
}
