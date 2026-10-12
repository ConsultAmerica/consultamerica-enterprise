/**
 * The recruiter's application queue, on Neon.
 *
 * This file used to be a 308 redirect to /app/recruiting/applications, the
 * Supabase-backed workspace queue. That system is untouched and still works;
 * this is the equivalent screen for the new recruitment schema in
 * db/neon/001_init.sql, which has its own admin users, its own session cookie
 * and its own tables. The two do not share a row.
 *
 * FILTER STATE LIVES IN THE URL. The toolbar is a plain GET form, so the
 * filtered view can be bookmarked, pasted to a colleague and survives a reload,
 * the page stays a server component that does the filtering in SQL, and the
 * screen needs no client JavaScript at all.
 */
import type { Metadata } from "next";
import Link from "next/link";

import {
  ApplicationsTable,
  type ApplicationRowView,
} from "@/components/admin/ApplicationsTable";
import { countApplicationsByStatus, listApplications } from "@/lib/neon/applications";
import { requireAdmin } from "@/lib/neon/auth";
import { NeonConfigError, isUuid } from "@/lib/neon/client";
import { listJobs } from "@/lib/neon/jobs";
import { APPLICATION_STATUSES, isApplicationStatus } from "@/lib/neon/types";
import type { ApplicationStatus } from "@/lib/neon/types";

export const metadata: Metadata = {
  title: "Applications",
  // An internal queue full of real people's details has nothing to gain from
  // being indexed and everything to lose.
  robots: { index: false, follow: false },
};

/** Reads cookies and live rows; there is nothing here to prerender. */
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Formatted on the server, in one fixed locale, so every recruiter reading the
 * same queue sees the same string. en-US matches the rest of the workspace
 * (components/workspace/format.ts).
 */
const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * TIMESTAMPTZ is documented as arriving as a Date (see the header of
 * lib/neon/types.ts), and the row types say so. The string branch is here
 * anyway because lib/neon/admin-users.ts normalises for the same reason, and
 * because being wrong about it would mean Intl raising on every row — a 500 for
 * the whole queue — rather than one odd-looking cell.
 */
function asDate(value: Date | string | null | undefined): Date | null {
  const date = value instanceof Date ? value : typeof value === "string" && value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** The full timestamp, for the cell's title attribute. */
function isoDate(value: Date | string | null): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function fmtDate(value: Date | string | null): string {
  const date = asDate(value);
  return date ? DATE.format(date) : "—";
}

/**
 * Pill tone per stage. Duplicated in the other CRM screens rather than shared,
 * because the obvious home for it would be the "use client" stage control and a
 * server component cannot read a value out of a client module: the RSC loader
 * replaces every export of a "use client" file with a client reference.
 */
function stageTone(status: ApplicationStatus): string {
  switch (status) {
    case "NEW":
      return "blue";
    case "INTERVIEW":
    case "SHORTLISTED":
      return "amber";
    case "OFFER":
    case "HIRED":
      return "green";
    case "REJECTED":
      return "red";
    default:
      return "";
  }
}

/** Every status in the schema is one word, so a label is a case change. */
const stageLabel = (status: string) => status.charAt(0) + status.slice(1).toLowerCase();

/*
  The same tone and label data as the helpers above, as plain objects.
  ApplicationsTable is a client component and a function cannot cross that
  boundary, so the mapping is materialised once here rather than duplicated
  there — one source, so the list and the bulk control cannot disagree about
  what colour "Interview" is.
*/
const STAGE_TONES = Object.fromEntries(
  APPLICATION_STATUSES.map((status) => [status, stageTone(status)]),
) as Record<ApplicationStatus, string>;

const STAGE_LABELS = Object.fromEntries(
  APPLICATION_STATUSES.map((status) => [status, stageLabel(status)]),
) as Record<ApplicationStatus, string>;

/*
  The stages a bulk move may target, in pipeline order. REJECTED is included
  because declining a batch is a real and common action; WITHDRAWN is not,
  because only a candidate withdraws and recording it on their behalf in bulk
  would put words in several people's mouths at once.
*/
const BULK_STAGES: ReadonlyArray<{ value: ApplicationStatus; label: string }> = [
  "NEW",
  "SCREENING",
  "INTERVIEW",
  "SHORTLISTED",
  "OFFER",
  "HIRED",
  "REJECTED",
].map((status) => ({
  value: status as ApplicationStatus,
  label: stageLabel(status),
}));

export default async function AdminApplicationsPage({ searchParams }: Props) {
  const params = await searchParams;

  const q = (one(params.q) ?? "").slice(0, 200).trim();
  const stageParam = one(params.stage);
  const stage: ApplicationStatus | "ALL" = isApplicationStatus(stageParam) ? stageParam : "ALL";
  // Screened before it reaches a uuid comparison: listApplications binds this
  // straight into `a.job_id = $2`, and Postgres raises
  // invalid_text_representation on a malformed uuid, which would turn a
  // hand-edited URL into a 500.
  const jobParam = one(params.job);
  const jobId = isUuid(jobParam) ? jobParam : undefined;
  /*
    Sort is read here and handed to Postgres, not applied to the array below.
    The page caps at 100 rows of what may be thousands; sorting the page and
    calling it the queue is wrong in exactly the case that matters, a backlog
    longer than one page. listApplications maps these through a fixed lookup
    (APPLICATION_SORTS), so an unknown value degrades to the default rather
    than reaching the database.
  */
  const sortParam = one(params.sort);
  const sort =
    sortParam === "candidate" || sortParam === "role" || sortParam === "stage"
      ? sortParam
      : "applied";
  const dir = one(params.dir) === "asc" ? "asc" : "desc";

  type Loaded = Awaited<ReturnType<typeof load>>;
  async function load() {
    const [rows, jobs, counts] = await Promise.all([
      listApplications({ status: stage, jobId, q: q || undefined, sort, dir, limit: 100 }),
      // The filter dropdown lists every role, including drafts: an application
      // can exist against a role that has since been unpublished, and the
      // recruiter still has to be able to filter down to it.
      listJobs({ limit: 200 }),
      countApplicationsByStatus(),
    ]);
    return { rows, jobs, counts };
  }

  let loaded: Loaded | null = null;
  let notConfigured = false;
  try {
    await requireAdmin({ returnTo: "/admin/applications" });
    loaded = await load();
  } catch (error) {
    // Only the "no connection string" case is handled here. Anything else —
    // including the redirect requireAdmin throws for a signed-out visitor, and
    // a real database outage — keeps its own behaviour.
    if (!(error instanceof NeonConfigError)) throw error;
    notConfigured = true;
  }

  // Copied to a const so the narrowing survives into the JSX callbacks below.
  // TypeScript discards a `let`'s narrowed type inside a closure, because the
  // closure could run after a later assignment.
  const data = loaded;
  const filtered = Boolean(q) || stage !== "ALL" || Boolean(jobId);
  // countApplicationsByStatus counts the whole table, so the per-stage numbers
  // in the dropdown are only true when nothing else narrows the view. They stay
  // off under a search or a role filter rather than quietly contradicting the
  // rows on screen.
  const scoped = Boolean(q) || Boolean(jobId);
  const total = data
    ? APPLICATION_STATUSES.reduce((sum, key) => sum + data.counts[key], 0)
    : 0;

  return (
    <main className="ws-main">
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Consult America / Recruitment</p>
          <h1>Applications</h1>
          <p>
            Every application submitted through the Consult America careers site, newest first.
            Open one to work it through the hiring stages.
          </p>
        </div>
        {/* No section links here: app/admin/layout.tsx draws the admin nav, and
            a second copy of Jobs / Candidates in the heading would be two
            places to keep in step. */}
      </div>

      {notConfigured ? (
        <ConfigPanel />
      ) : !data ? null : (
        <section className="ws-panel">
          <form className="ws-toolbar" method="get" role="search">
            <div className="ws-toolbar-field">
              <label htmlFor="app-q">Search</label>
              <input
                id="app-q"
                name="q"
                type="search"
                autoComplete="off"
                defaultValue={q}
                placeholder="Name, email, or application reference"
              />
            </div>
            <div className="ws-toolbar-field">
              <label htmlFor="app-stage">Stage</label>
              <select id="app-stage" name="stage" defaultValue={stage}>
                <option value="ALL">All stages</option>
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {scoped ? stageLabel(status) : `${stageLabel(status)} (${data.counts[status]})`}
                  </option>
                ))}
              </select>
            </div>
            <div className="ws-toolbar-field">
              <label htmlFor="app-job">Role</label>
              <select id="app-job" name="job" defaultValue={jobId ?? ""}>
                <option value="">All roles</option>
                {data.jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} · {job.reference}
                  </option>
                ))}
              </select>
            </div>
            <div className="ca-crm-toolbar-actions">
              <button type="submit" className="ws-btn primary">
                Filter
              </button>
              {filtered ? (
                <Link className="ws-btn" href="/admin/applications">
                  Clear
                </Link>
              ) : null}
            </div>
            <p className="ws-toolbar-count" aria-live="polite">
              {filtered
                ? `${data.rows.length} of ${total} application${total === 1 ? "" : "s"}`
                : `${total} application${total === 1 ? "" : "s"}`}
            </p>
          </form>

          {data.rows.length === 0 ? (
            total === 0 ? (
              <NoApplicationsYet />
            ) : (
              <div className="ws-empty">
                <h2>Nothing matches those filters</h2>
                <p>
                  There {total === 1 ? "is" : "are"} {total} application
                  {total === 1 ? "" : "s"} in the system, but none in this stage, role or search.
                </p>
                <Link className="ws-btn" href="/admin/applications">
                  Clear filters
                </Link>
              </div>
            )
          ) : (
            <>
              {/*
                Rows are mapped to a flat view model here rather than handed to
                the table raw. The table is a client component, so everything
                crossing that boundary is serialized: passing the whole row
                would ship resume_url (a private blob URL), zoho ids and
                internal notes to the browser for no reason. This sends only
                what is rendered.
              */}
              <ApplicationsTable
                rows={data.rows.map<ApplicationRowView>((row) => ({
                  id: row.id,
                  reference: row.reference,
                  status: row.status,
                  appliedLabel: fmtDate(row.applied_at),
                  appliedIso: isoDate(row.applied_at),
                  // first_name and last_name are NOT NULL but may be '' — the
                  // sparse re-application upsert depends on that — so the email
                  // is the fallback label rather than a blank cell.
                  candidateName:
                    `${row.candidate_first_name} ${row.candidate_last_name}`.trim() ||
                    row.candidate_email,
                  candidateEmail: row.candidate_email,
                  jobTitle: row.job_title,
                  jobReference: row.job_reference,
                  // Presence only. ResumeLink gates on it and never hrefs it;
                  // the signing route is the only way the bytes are reached.
                  resumeUrl: row.resume_url ? "stored" : null,
                  resumeFilename: row.resume_filename,
                  resumeSizeBytes: row.resume_size_bytes,
                }))}
                stages={BULK_STAGES}
                stageTone={STAGE_TONES}
                stageLabel={STAGE_LABELS}
              />
              {data.rows.length === 100 ? (
                <p className="ws-table-caption">
                  Showing the 100 most recent matches. Narrow the search or the stage filter to
                  see older applications.
                </p>
              ) : null}
            </>
          )}
        </section>
      )}
    </main>
  );
}

/**
 * The state this screen is actually in today: the schema is deployed and
 * nothing has applied yet. It explains where applications come from rather than
 * leaving a recruiter looking at an empty table wondering what is broken.
 */
function NoApplicationsYet() {
  return (
    <div className="ws-empty">
      <h2>No applications yet</h2>
      <p>
        An application arrives here the moment somebody applies to a published role on the
        careers site. Nothing is imported from Zoho or anywhere else, so this queue stays empty
        until a role is published and a candidate submits the form on it.
      </p>
      <Link className="ws-btn primary" href="/admin/jobs">
        Publish a role
      </Link>
    </div>
  );
}

/**
 * Shown when lib/neon/client.ts reports that no connection string exists. The
 * variable is named because the fix is one environment setting, and a 500 would
 * send an administrator to the logs to learn the same sentence.
 */
function ConfigPanel() {
  return (
    <section className="ws-panel">
      <div className="ws-empty">
        <h2>The recruitment database is not configured</h2>
        <p>
          No Neon connection string is set on this deployment, so applications cannot be read or
          written. Set <strong>DATABASE_URL</strong> (or <strong>POSTGRES_URL</strong>) to the
          Neon pooled connection string in the project&rsquo;s environment variables and reload.
          Locally, copy it into <strong>.env.local</strong>.
        </p>
      </div>
    </section>
  );
}
