import type { Metadata } from "next";
import Link from "next/link";

import { AdminJobRowActions } from "@/components/admin/AdminJobRowActions";
import { requireAdmin } from "@/lib/neon/auth";
import { NeonConfigError, query } from "@/lib/neon/client";
import { listJobs } from "@/lib/neon/jobs";
import { isJobStatus, type JobRow, type JobStatus } from "@/lib/neon/types";

/**
 * The admin jobs list for the Neon recruitment system.
 *
 * This file used to be a 308 redirect to /app/recruiting/jobs, the Supabase
 * workspace. That workspace still exists and still works; this is now the list
 * for the separate Neon-backed system (db/neon/001_init.sql), which has its own
 * jobs table, its own admin users and its own session cookie.
 *
 * OPERATIONAL NOTE: because the previous version answered with a *permanent*
 * redirect, a browser that visited /admin/jobs before this change will keep
 * sending itself to /app/recruiting/jobs from cache until that entry expires.
 * A hard reload clears it.
 *
 * A server component. Both filters live in the URL and the filter bar is a
 * plain GET form, so the whole screen works with scripting disabled; the only
 * client code on the page is the per-row action buttons, which need it.
 *
 * Returns a fragment, not a <main>: app/admin/layout.tsx draws the signed-in
 * chrome and already wraps children in <main className="ws-main">. The one
 * exception is the "database not configured" branch below, which is reached
 * precisely when that layout could not read a session either and therefore
 * rendered no chrome at all.
 */

export const metadata: Metadata = {
  title: "Jobs",
  // An admin list has nothing to offer a search engine and a job pipeline to
  // leak to one.
  robots: { index: false, follow: false },
};

/**
 * Never cached. An admin who just published a job and navigated back must see
 * it live, and the actions' revalidatePath calls are about the public pages.
 */
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Page size. listJobs clamps anything above 200, and pagination is not part of
 * this screen yet, so the caption says so when the cap is actually reached
 * rather than silently showing a truncated list.
 */
const PAGE_LIMIT = 200;

const STATUS_OPTIONS: ReadonlyArray<{ value: JobStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "UNPUBLISHED", label: "Unpublished" },
  { value: "ARCHIVED", label: "Archived" },
];

/**
 * Publication state has to be readable at a glance: green plus a dot means a
 * visitor can see this job right now, and nothing else can.
 */
function pillClass(status: JobStatus): string {
  if (status === "PUBLISHED") return "ws-pill green live";
  if (status === "DRAFT") return "ws-pill amber";
  // Unpublished and archived are off the site, deliberately. Neutral, not red:
  // neither is an error state.
  return "ws-pill";
}

/** FULL_TIME -> "Full time". Covers every CHECK value in the schema, so adding
 *  one to the database cannot leave a raw SCREAMING_CASE label on this page. */
function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .join(" ")
    .replace(/^./, (character) => character.toUpperCase());
}

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatSalary(job: JobRow): string {
  const { salary_min: min, salary_max: max, salary_currency: currency } = job;
  if (min === null && max === null) return "—";
  const amount = (value: number) => value.toLocaleString("en-US");
  if (min !== null && max !== null) return `${currency} ${amount(min)}–${amount(max)}`;
  return min !== null ? `${currency} ${amount(min)}+` : `Up to ${currency} ${amount(max as number)}`;
}

/**
 * Applications per job, for the whole page, in one statement.
 *
 * lib/neon/jobs.ts does not return this (listJobs is a plain SELECT over jobs)
 * and lib/neon/applications.ts only offers a global per-status count or the
 * rows for one job at a time — a per-row call would be one query per job.
 * Extending either module is outside this change's file list, so the aggregate
 * lives here: one indexed GROUP BY over applications_job_idx, regardless of how
 * many jobs are listed.
 */
async function countApplicationsPerJob(jobIds: readonly string[]): Promise<Map<string, number>> {
  if (jobIds.length === 0) return new Map();
  const rows = await query<{ job_id: string; count: number }>(
    `SELECT job_id, count(*)::int AS count
       FROM applications
      WHERE job_id = ANY($1::uuid[])
      GROUP BY job_id`,
    [jobIds],
  );
  return new Map(rows.map((row) => [row.job_id, row.count]));
}

type LoadResult =
  | {
      ok: true;
      jobs: JobRow[];
      applicants: Map<string, number>;
      /** False only when the jobs table itself is empty, which is a different
       *  screen from "this filter matches nothing". */
      anyJobExists: boolean;
    }
  | { ok: false; configError: string };

/**
 * Loading is a function returning a discriminated union rather than inline
 * try/catch around the render, so a missing DATABASE_URL produces a panel that
 * names the variable instead of an unexplained 500 — while redirect() from
 * requireAdmin, which is also a throw, still propagates untouched.
 */
async function load(
  q: string,
  status: JobStatus | "ALL",
  filtersActive: boolean,
): Promise<LoadResult> {
  try {
    // Authorization, not data: the signed-in admin's name and sign-out live in
    // app/admin/layout.tsx, so the return value is not needed here.
    await requireAdmin({ returnTo: "/admin/jobs" });
    const jobs = await listJobs({ q: q || undefined, status, limit: PAGE_LIMIT });
    const [applicants, probe] = await Promise.all([
      countApplicationsPerJob(jobs.map((job) => job.id)),
      // Only asked when a narrowing filter returned nothing, and then only for
      // one row: enough to tell an empty database from an empty result.
      filtersActive && jobs.length === 0 ? listJobs({ limit: 1 }) : Promise.resolve(null),
    ]);
    return {
      ok: true,
      jobs,
      applicants,
      anyJobExists: jobs.length > 0 || (probe !== null && probe.length > 0),
    };
  } catch (error) {
    if (error instanceof NeonConfigError) {
      return { ok: false, configError: error.message };
    }
    throw error;
  }
}

export default async function AdminJobsPage({ searchParams }: Props) {
  const params = await searchParams;

  const q = (one(params.q) ?? "").trim().slice(0, 200);
  // Accepted case-insensitively so ?status=published works as well as the
  // canonical ?status=PUBLISHED. An unknown value degrades to ALL rather than
  // rendering an empty screen with no explanation.
  const statusParam = (one(params.status) ?? "").toUpperCase();
  const status: JobStatus | "ALL" = isJobStatus(statusParam) ? statusParam : "ALL";
  const filtersActive = q !== "" || status !== "ALL";

  const loaded = await load(q, status, filtersActive);

  if (!loaded.ok) {
    // Carries its own .ws / .ws-main because reaching this branch means
    // app/admin/layout.tsx could not read a session either (same missing
    // DATABASE_URL), so it rendered children bare and this panel is the page.
    return (
      <div className="ws">
        <main className="ws-main">
          <div className="ws-head">
            <div>
              <p className="ws-eyebrow">Consult America admin</p>
              <h1>Jobs</h1>
            </div>
          </div>
          <section className="ws-panel adm-config" role="alert">
            <h2>The recruitment database is not configured</h2>
            <p>
              <code>DATABASE_URL</code> is unset, so there is nothing for this page to read. Point{" "}
              <code>DATABASE_URL</code> (or <code>POSTGRES_URL</code>) at the Neon pooled connection
              string — in <code>.env.local</code> for local development, or in the Vercel project
              environment variables — then reload. No job data has been lost; this page simply
              cannot reach the database.
            </p>
            <p className="adm-config-detail">{loaded.configError}</p>
          </section>
        </main>
      </div>
    );
  }

  const { jobs, applicants, anyJobExists } = loaded;
  const atPageLimit = jobs.length === PAGE_LIMIT;

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Consult America admin</p>
          <h1>Jobs</h1>
          <p>
            Every job in the recruitment database, newest first. Jobs are typed in here by hand;
            nothing is imported. Only a published job is visible to the public.
          </p>
        </div>
        <Link className="ws-btn primary" href="/admin/jobs/new">
          New job
        </Link>
      </div>

      <section className="ws-panel">
        {anyJobExists ? (
          /* A plain GET form, so the filtered view is a shareable URL and the
             screen keeps working without JavaScript. method defaults to GET;
             it is written out because the behaviour is the point. */
          <form className="ws-toolbar" role="search" method="get" action="/admin/jobs">
            <div className="ws-toolbar-field">
              <label htmlFor="jobs-search">Search</label>
              <input
                id="jobs-search"
                name="q"
                type="search"
                autoComplete="off"
                maxLength={200}
                defaultValue={q}
                placeholder="Title, reference, department or location"
              />
            </div>
            <div className="ws-toolbar-field">
              <label htmlFor="jobs-status">Status</label>
              <select id="jobs-status" name="status" defaultValue={status}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="ws-toolbar-field adm-toolbar-submit">
              <button type="submit" className="ws-btn">
                Apply
              </button>
            </div>
            {filtersActive ? (
              <div className="ws-toolbar-field adm-toolbar-submit">
                <Link className="ws-btn" href="/admin/jobs">
                  Clear
                </Link>
              </div>
            ) : null}
            <p className="ws-toolbar-count" aria-live="polite">
              {jobs.length}{" "}
              {filtersActive
                ? jobs.length === 1
                  ? "job matches"
                  : "jobs match"
                : jobs.length === 1
                  ? "job"
                  : "jobs"}
            </p>
          </form>
        ) : null}

        {!anyJobExists ? (
          <div className="ws-empty">
            <h2>No jobs yet</h2>
            <p>
              The recruitment database has no jobs in it. Create the first one by hand — you can
              save it as a draft, read it back, and publish it to the careers page when the
              description is ready.
            </p>
            <Link className="ws-btn primary" href="/admin/jobs/new">
              Create the first job
            </Link>
          </div>
        ) : jobs.length === 0 ? (
          <div className="ws-empty">
            <h2>No jobs match this filter</h2>
            <p>
              {q ? <>Nothing matches &ldquo;{q}&rdquo;</> : <>No job is in this status</>}
              {q && status !== "ALL" ? <> in this status</> : null}. Clear the filter to see every
              job again.
            </p>
            <Link className="ws-btn" href="/admin/jobs">
              Clear filter
            </Link>
          </div>
        ) : (
          <>
            <div className="ws-table-wrap">
              <table className="ws-table">
                <caption className="adm-table-caption">
                  Only <strong>Published</strong> jobs are visible to the public. Draft, unpublished
                  and archived jobs stay inside this dashboard.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Job</th>
                    <th scope="col">Department</th>
                    <th scope="col">Location</th>
                    <th scope="col">Salary</th>
                    <th scope="col">Status</th>
                    <th scope="col">Applicants</th>
                    <th scope="col">Updated</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <Link href={`/admin/jobs/${job.id}`}>{job.title}</Link>
                        <div className="ws-muted">
                          {job.reference} · {humanizeEnum(job.employment_type)} ·{" "}
                          {humanizeEnum(job.workplace_type)}
                        </div>
                      </td>
                      <td>{job.department}</td>
                      <td>{job.location}</td>
                      <td className="ws-muted">{formatSalary(job)}</td>
                      <td>
                        <span
                          className={pillClass(job.status)}
                          title={
                            job.status === "PUBLISHED"
                              ? "Live on the public careers page"
                              : "Internal only"
                          }
                        >
                          {humanizeEnum(job.status)}
                        </span>
                      </td>
                      <td>{applicants.get(job.id) ?? 0}</td>
                      <td className="ws-muted">{formatDate(job.updated_at)}</td>
                      <td>
                        <AdminJobRowActions id={job.id} status={job.status} title={job.title} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {atPageLimit ? (
              <p className="ws-table-caption">
                Showing the {PAGE_LIMIT} most recently created jobs. Narrow the search to reach
                older ones.
              </p>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
