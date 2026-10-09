import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminJobRowActions } from "@/components/admin/AdminJobRowActions";
import { findById } from "@/lib/neon/admin-users";
import { requireAdmin } from "@/lib/neon/auth";
import { NeonConfigError, query } from "@/lib/neon/client";
import { getJobById } from "@/lib/neon/jobs";
import type { JobRow, JobStatus } from "@/lib/neon/types";

/**
 * One job, as the admin sees it: every stored field, who created it and when,
 * how many people have applied, and the status actions available to it.
 *
 * This is also the landing page after a create or an edit, which is why it
 * shows the generated slug and reference — the two identifiers the form cannot
 * show because they do not exist until the row does.
 *
 * Returns a fragment: app/admin/layout.tsx supplies the signed-in chrome and
 * the <main className="ws-main"> wrapper. The "database not configured" branch
 * is the exception, for the reason noted at that branch.
 */

export const metadata: Metadata = {
  title: "Job",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function pillClass(status: JobStatus): string {
  if (status === "PUBLISHED") return "ws-pill green live";
  if (status === "DRAFT") return "ws-pill amber";
  return "ws-pill";
}

function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .join(" ")
    .replace(/^./, (character) => character.toUpperCase());
}

/** Date and time, because an admin reading this page is often asking "did my
 *  publish actually land", and a bare date cannot answer that. */
function formatMoment(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSalary(job: JobRow): string {
  const { salary_min: min, salary_max: max, salary_currency: currency } = job;
  if (min === null && max === null) return "Not specified";
  const amount = (value: number) => value.toLocaleString("en-US");
  if (min !== null && max !== null) return `${currency} ${amount(min)}–${amount(max)}`;
  return min !== null
    ? `${currency} ${amount(min)} and up`
    : `Up to ${currency} ${amount(max as number)}`;
}

type LoadResult =
  | { ok: true; job: JobRow | null; applicants: number; createdBy: string | null }
  | { ok: false; configError: string };

/**
 * See the note in app/admin/jobs/page.tsx: a union rather than try/catch around
 * the render, so an unset DATABASE_URL becomes a panel that names the variable
 * while requireAdmin's redirect and notFound's signal keep propagating.
 */
async function load(id: string): Promise<LoadResult> {
  try {
    await requireAdmin({ returnTo: `/admin/jobs/${id}` });
    const job = await getJobById(id);
    if (!job) return { ok: true, job: null, applicants: 0, createdBy: null };

    const [counted, author] = await Promise.all([
      // Counted here rather than through lib/neon/applications.ts, which
      // exposes a global per-status count and a row listing but no per-job
      // total. One indexed count beats fetching rows to measure their length.
      query<{ count: number }>(
        "SELECT count(*)::int AS count FROM applications WHERE job_id = $1",
        [job.id],
      ),
      // created_by is a uuid and ON DELETE SET NULL, so it is both unreadable
      // on its own and legitimately absent for a job whose author has left.
      job.created_by ? findById(job.created_by) : Promise.resolve(null),
    ]);

    return {
      ok: true,
      job,
      applicants: counted[0]?.count ?? 0,
      createdBy: author?.fullName ?? null,
    };
  } catch (error) {
    if (error instanceof NeonConfigError) {
      return { ok: false, configError: error.message };
    }
    throw error;
  }
}

export default async function AdminJobDetailPage({ params }: Props) {
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
                <Link href="/admin/jobs">Jobs</Link>
              </p>
              <h1>Job</h1>
            </div>
          </div>
          <section className="ws-panel adm-config" role="alert">
            <h2>The recruitment database is not configured</h2>
            <p>
              <code>DATABASE_URL</code> is unset, so this job could not be read. Point{" "}
              <code>DATABASE_URL</code> (or <code>POSTGRES_URL</code>) at the Neon pooled
              connection string — in <code>.env.local</code> for local development, or in the
              Vercel project environment variables — then reload.
            </p>
            <p className="adm-config-detail">{loaded.configError}</p>
          </section>
        </main>
      </div>
    );
  }

  // getJobById screens a malformed uuid itself and reports a miss, so a bad id
  // in the URL is a 404 rather than a database error.
  if (!loaded.job) notFound();

  const { job, applicants, createdBy } = loaded;
  const isPublic = job.status === "PUBLISHED";

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">
            <Link href="/admin/jobs">Jobs</Link> · {job.reference}
          </p>
          <h1>{job.title}</h1>
          <p>
            <span
              className={pillClass(job.status)}
              title={isPublic ? "Live on the public careers page" : "Internal only"}
            >
              {humanizeEnum(job.status)}
            </span>{" "}
            {isPublic ? (
              <>
                Visible to the public at{" "}
                <Link href={`/jobs/${job.slug}`} className="adm-public-link">
                  /jobs/{job.slug}
                </Link>
                .
              </>
            ) : (
              <>Not visible to the public. Its public address will be /jobs/{job.slug}.</>
            )}
          </p>
        </div>
        <div className="adm-head-actions">
          <AdminJobRowActions id={job.id} status={job.status} title={job.title} />
        </div>
      </div>

      <section className="ws-panel">
        <h2>Details</h2>
        {/* Flat dt/dd pairs, no wrapper elements: .ws-dl is a two-column grid
            whose children are the terms and descriptions themselves. */}
        <dl className="ws-dl">
          <dt>Reference</dt>
          <dd>{job.reference}</dd>
          <dt>Department</dt>
          <dd>{job.department}</dd>
          <dt>Location</dt>
          <dd>{job.location}</dd>
          <dt>Work arrangement</dt>
          <dd>{humanizeEnum(job.workplace_type)}</dd>
          <dt>Employment type</dt>
          <dd>{humanizeEnum(job.employment_type)}</dd>
          <dt>Experience level</dt>
          <dd>{job.experience_level ?? "Not specified"}</dd>
          <dt>Salary</dt>
          <dd>{formatSalary(job)}</dd>
          <dt>Closing date</dt>
          <dd>
            {job.application_deadline ? formatMoment(job.application_deadline) : "No closing date"}
          </dd>
        </dl>
      </section>

      <section className="ws-panel">
        <h2>Record</h2>
        <dl className="ws-dl">
          <dt>Applications</dt>
          <dd>{applicants}</dd>
          <dt>Created</dt>
          <dd>
            {formatMoment(job.created_at)}
            {createdBy ? <span className="ws-muted"> by {createdBy}</span> : null}
          </dd>
          <dt>Last updated</dt>
          <dd>{formatMoment(job.updated_at)}</dd>
          <dt>First published</dt>
          {/* Stamped once, the first time the job reaches PUBLISHED, and then
              left alone — so unpublishing and republishing does not reorder the
              careers page or make the role look newly posted. */}
          <dd>{job.published_at ? formatMoment(job.published_at) : "Never published"}</dd>
          <dt>Public URL segment</dt>
          {/* Allocated once at creation and never recomputed, even when the
              title changes, so a link someone shared does not rot. */}
          <dd>
            <code>{job.slug}</code>
          </dd>
        </dl>
      </section>

      <section className="ws-panel">
        <h2>About the role</h2>
        {/* pre-wrap: the description is stored as the admin typed it, and its
            paragraph breaks are the only structure it has. */}
        <p className="adm-prose">{job.description}</p>
      </section>

      {(
        [
          ["Responsibilities", job.responsibilities],
          ["Requirements", job.requirements],
          ["Benefits", job.benefits],
        ] as const
      ).map(([heading, items]) => (
        <section className="ws-panel" key={heading}>
          <h2>{heading}</h2>
          {items.length === 0 ? (
            <p className="ws-muted">
              None recorded. <Link href={`/admin/jobs/${job.id}/edit`}>Edit the job</Link> to add
              them.
            </p>
          ) : (
            <ul className="ws-list">
              {items.map((item, index) => (
                // Items are free text and may legitimately repeat, so the index
                // is the only stable key available for this static list.
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
