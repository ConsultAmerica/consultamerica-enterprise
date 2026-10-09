import Link from "next/link";

import {
  type ApplicationListItem,
  countApplicationsByStatus,
  listApplications,
} from "@/lib/neon/applications";
import {
  AUTH_NOTICES,
  type AdminSessionUser,
  isAuthNotice,
  requireAdmin,
} from "@/lib/neon/auth";
import { NeonConfigError, query } from "@/lib/neon/client";
import type { ApplicationStatus } from "@/lib/neon/types";
import { logServerError } from "@/lib/observability/logger";

/**
 * The recruitment admin overview.
 *
 * This file used to be a 308 redirect to /app/recruiting (the Supabase
 * workspace). That alias is why a successful admin sign-in bounced straight
 * back to /login: the Neon login action lands on DEFAULT_ADMIN_LANDING
 * (/admin/dashboard), the redirect threw the browser into the Supabase
 * workspace, and the Supabase guard there has never heard of the ca_admin_session
 * cookie. The old workspace is untouched and still lives at /app/recruiting.
 *
 * Browsers that visited /admin/dashboard before this change hold a *permanent*
 * redirect in cache and will keep sending themselves to /app/recruiting until
 * that entry expires. A hard reload or a fresh profile clears it.
 *
 * Every number rendered here is a count returned by Postgres in this request.
 * Nothing is cached, derived from a sample, or defaulted when a query fails:
 * when a read cannot be completed the page says so instead of printing a zero,
 * because a fabricated zero on a recruitment dashboard reads as "no applicants"
 * and that is a decision-changing lie.
 *
 * The guard is here rather than in app/admin/layout.tsx, which also wraps the
 * sign-in and password-reset pages; see the comment in that file.
 */
export const metadata = { title: "Dashboard" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * The pipeline, in the order an application moves through it. REJECTED and
 * WITHDRAWN are counted as well but reported separately below: folding closed
 * applications into this row would make the figures read as open work.
 */
const PIPELINE: readonly { status: ApplicationStatus; label: string; tone: string }[] = [
  { status: "NEW", label: "New", tone: "blue" },
  { status: "SCREENING", label: "Screening", tone: "amber" },
  { status: "INTERVIEW", label: "Interview", tone: "amber" },
  { status: "SHORTLISTED", label: "Shortlisted", tone: "blue" },
  { status: "OFFER", label: "Offer", tone: "green" },
  { status: "HIRED", label: "Hired", tone: "green" },
];

const STATUS_TONES: Record<ApplicationStatus, string> = {
  NEW: "blue",
  SCREENING: "amber",
  INTERVIEW: "amber",
  SHORTLISTED: "blue",
  OFFER: "green",
  HIRED: "green",
  REJECTED: "red",
  WITHDRAWN: "",
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  NEW: "New",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  SHORTLISTED: "Shortlisted",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

/** How many recent applications the overview lists before deferring to the queue. */
const RECENT_LIMIT = 10;

const ENV_VAR = "DATABASE_URL";

// ---------------------------------------------------------------- reading data

type HeadlineTotals = {
  publishedJobs: number;
  draftJobs: number;
  totalJobs: number;
  candidates: number;
};

/**
 * Job and candidate totals, as one aggregate.
 *
 * WHY THIS IS A QUERY AND NOT A CALL INTO lib/neon/jobs.ts: the data layer has
 * no countJobsByStatus or countCandidates (applications is the only table with
 * a counter, countApplicationsByStatus, used below) and lib/neon/* is outside
 * the scope of this change, so adding one is not an option here. The available
 * readers are listJobs() and listCandidates(), and both are LIMIT-capped —
 * clampLimit() refuses anything above 200 — so counting their rows would start
 * silently under-reporting at the 201st job with no indication on screen. An
 * undercount presented as a total is the kind of number someone makes a hiring
 * decision on, so this asks Postgres to do the counting instead.
 *
 * One statement rather than four: the HTTP transport costs a round trip per
 * statement, and scalar subqueries let a single trip answer the whole header.
 * FILTER beats four COUNT(CASE ...) expressions only in readability, which is
 * reason enough.
 */
async function loadHeadlineTotals(): Promise<HeadlineTotals> {
  const rows = await query<{
    published_jobs: number;
    draft_jobs: number;
    total_jobs: number;
    total_candidates: number;
  }>(
    `SELECT (count(*) FILTER (WHERE status = 'PUBLISHED'))::int AS published_jobs,
            (count(*) FILTER (WHERE status = 'DRAFT'))::int     AS draft_jobs,
            count(*)::int                                      AS total_jobs,
            (SELECT count(*)::int FROM candidates)             AS total_candidates
       FROM jobs`,
  );

  // An aggregate with no GROUP BY always returns exactly one row, even against
  // empty tables. The fallback exists only so a driver that somehow returns
  // nothing cannot be mistaken for a database full of zeros.
  const row = rows[0];
  if (!row) {
    throw new Error("Job and candidate totals returned no row");
  }

  return {
    publishedJobs: row.published_jobs,
    draftJobs: row.draft_jobs,
    totalJobs: row.total_jobs,
    candidates: row.total_candidates,
  };
}

type Dashboard = {
  totals: HeadlineTotals;
  byStatus: Record<ApplicationStatus, number>;
  recent: ApplicationListItem[];
};

type LoadResult =
  | { ok: true; data: Dashboard }
  | { ok: false; reason: "not-configured" | "unavailable" };

/**
 * All three reads, concurrently, with the two failure modes kept distinct.
 *
 * Returning a result object instead of throwing is what lets the page render a
 * panel for each case. "not-configured" is a deployment mistake with an exact
 * fix (set DATABASE_URL); "unavailable" is Neon being Neon, and retrying is the
 * only advice worth giving.
 */
async function loadDashboard(): Promise<LoadResult> {
  try {
    const [totals, byStatus, recent] = await Promise.all([
      loadHeadlineTotals(),
      countApplicationsByStatus(),
      // listApplications already orders by applied_at DESC and has an index for
      // it (applications_recent_idx), so "most recent ten" is just a limit.
      listApplications({ limit: RECENT_LIMIT }),
    ]);
    return { ok: true, data: { totals, byStatus, recent } };
  } catch (error) {
    if (error instanceof NeonConfigError) {
      return { ok: false, reason: "not-configured" };
    }
    // The visitor gets a sentence; the stack goes to the server log rather than
    // into the page, where a connection string could end up on screen.
    logServerError("admin-dashboard/load", error);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * requireAdmin(), with one error turned into a value.
 *
 * getSessionUser() runs a query, so an unset DATABASE_URL surfaces as a
 * NeonConfigError from the guard itself, before any dashboard read happens.
 * Catching it here is what turns the commonest deploy mistake into an
 * explanation instead of a 500. Everything else is re-thrown untouched, which
 * matters more than it looks: redirect() signals its work by throwing, so
 * swallowing unknown errors here would break both the sign-in redirect and the
 * must-change-password redirect.
 */
async function guard(): Promise<AdminSessionUser | "not-configured"> {
  try {
    return await requireAdmin({ returnTo: "/admin/dashboard" });
  } catch (error) {
    if (error instanceof NeonConfigError) return "not-configured";
    throw error;
  }
}

// ------------------------------------------------------------------- rendering

/**
 * Dates are rendered on the server, so they carry the server's timezone (UTC on
 * Vercel). The full ISO timestamp goes in a title attribute rather than being
 * dropped, so "which of these two arrived first" is always answerable.
 *
 * Typed to accept a string as well as a Date: the row types in lib/neon/types.ts
 * declare Date, and the driver does parse timestamptz into one, but a formatter
 * that falls over on a string would turn a driver-configuration change into a
 * crashed dashboard.
 */
function fmtWhen(value: Date | string | null): { text: string; iso: string | undefined } {
  if (!value) return { text: "—", iso: undefined };
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { text: "—", iso: undefined };
  return {
    text: date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    iso: date.toISOString(),
  };
}

/**
 * candidates.first_name and last_name are allowed to be '' by design (see the
 * note at the end of db/neon/002_fixes.sql), so a row can legitimately have no
 * name. The email is always present and unique, so it is the honest fallback —
 * better than an empty link nobody can click accurately.
 */
function candidateName(application: ApplicationListItem): string {
  const name = [application.candidate_first_name, application.candidate_last_name]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  return name || application.candidate_email;
}

/**
 * Rendered when DATABASE_URL is missing, which is the state of any deploy where
 * the Neon integration was never attached.
 *
 * Self-contained, with its own .ws and .ws-main: in this state
 * app/admin/layout.tsx cannot read the session either, so it renders no chrome
 * and this panel is the entire page. (The second call site below — a dashboard
 * read reporting "not configured" after the guard already succeeded — cannot
 * happen, because the guard's own query would have failed first. It is handled
 * anyway rather than left to fall through to a blank screen.)
 *
 * The .adm-config panel style is the one /admin/jobs and /admin/applications
 * already use for this exact condition, so the same problem looks the same
 * everywhere. Amber rather than red is their call and the right one: nothing is
 * broken or lost, a variable is simply absent.
 */
function DatabaseNotConfigured() {
  return (
    <div className="ws">
      <main className="ws-main">
        <div className="ws-head">
          <div>
            <p className="ws-eyebrow">Consult America admin</p>
            <h1>Recruitment admin is not connected to a database</h1>
            <p>
              A configuration problem, not a fault in the data: no connection string is set, so
              nothing has been read and no figures can honestly be shown.
            </p>
          </div>
        </div>
        <section className="ws-panel adm-config" role="alert">
          <h2>Set {ENV_VAR} and redeploy</h2>
          <p>
            The recruitment system reads <code>{ENV_VAR}</code> (or <code>POSTGRES_URL</code>, which
            the Vercel Neon integration also injects) and refuses to start without one,
            deliberately: a recruitment system that accepted applications and wrote them nowhere
            would hand candidates a confirmation for a submission that does not exist.
          </p>
          <ul className="adm-steps">
            <li>
              <strong>On Vercel:</strong> attach the Neon store to this project, or add{" "}
              <code>{ENV_VAR}</code> under Settings → Environment Variables, then redeploy.
              Environment variables are read at boot, so a running deployment will not pick it up on
              its own.
            </li>
            <li>
              <strong>Locally:</strong> copy the Neon pooled connection string into{" "}
              <code>.env.local</code> as <code>{ENV_VAR}</code> and restart the dev server.
            </li>
          </ul>
          <p className="adm-config-detail">
            Nothing else about the admin area is broken in a different way — sign-in, jobs,
            applications and candidates all read this same database, so every one of them is waiting
            on the same single variable.
          </p>
        </section>
      </main>
    </div>
  );
}

/**
 * Rendered when the database is configured but a read failed. Unlike the panel
 * above this one appears inside the signed-in shell: reaching it means
 * getSessionUser() succeeded a moment earlier, so the layout drew its chrome
 * and a second <main> here would be invalid markup.
 */
function DatabaseUnavailable() {
  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Consult America admin</p>
          <h1>Recruitment overview</h1>
          <p>The database did not answer, so this page has no figures to show.</p>
        </div>
      </div>
      <section className="ws-panel adm-alert">
        <h2>Could not read the recruitment database</h2>
        <p className="adm-note">
          The connection is configured but the query failed. This is usually a Neon compute that has
          scaled to zero and is waking up, or a transient network error; the detail has been written
          to the server log.
        </p>
        <p className="adm-note">
          No figures are shown rather than zeros, because &ldquo;no applications&rdquo; and
          &ldquo;we could not look&rdquo; are different answers and only one of them is true.
        </p>
        <div className="ws-actions">
          <Link className="ws-btn primary" href="/admin/dashboard">
            Try again
          </Link>
        </div>
      </section>
    </>
  );
}

/**
 * THE STATE THIS SYSTEM IS ACTUALLY IN TODAY: the database is empty.
 *
 * Shown above the figures when the jobs table has no rows, because every count
 * below it is then zero and a screen of unexplained zeros is indistinguishable
 * from a screen of broken queries. It says which it is, why, and what to do.
 */
function NoJobsYet({ candidates }: { candidates: number }) {
  return (
    <section className="ws-panel adm-onboard">
      <h2>No jobs exist yet</h2>
      <p className="adm-note">
        The database is connected and answering: the figures below are real counts, and they are
        zero because nothing has been created yet
        {candidates > 0
          ? ` — apart from ${candidates} candidate ${candidates === 1 ? "record" : "records"}, which arrived without a job attached.`
          : "."}{" "}
        Applications can only exist against a job, so a job is the first thing to make.
      </p>
      <ol className="adm-steps">
        <li>
          <strong>Create a job.</strong> It is saved as a draft, with a reference allocated for you.
          Nothing is visible to candidates until you choose to publish it.
        </li>
        <li>
          <strong>Publish it.</strong> Published is the only status candidates can see; drafts,
          unpublished and archived roles stay internal to this workspace.
        </li>
        <li>
          <strong>Work the applications.</strong> Each submission lands at New and moves through
          screening, interview, shortlist and offer to hired. This overview counts them by stage.
        </li>
      </ol>
      <div className="ws-actions">
        <Link className="ws-btn primary" href="/admin/jobs/new">
          Create the first job
        </Link>
        <Link className="ws-btn" href="/admin/jobs">
          Open jobs
        </Link>
      </div>
    </section>
  );
}

export default async function AdminDashboardPage({ searchParams }: Props) {
  const params = await searchParams;

  // Authorize before reading anything. requireRole() bounces a recruiter who
  // reached a restricted page to this one with ?notice=forbidden, so the notice
  // table in lib/neon/auth.ts is read here rather than inventing new copy.
  const admin = await guard();
  if (admin === "not-configured") {
    return <DatabaseNotConfigured />;
  }

  const noticeKey = one(params.notice);
  const notice = isAuthNotice(noticeKey) ? AUTH_NOTICES[noticeKey] : null;

  const loaded = await loadDashboard();
  if (!loaded.ok) {
    return loaded.reason === "not-configured" ? <DatabaseNotConfigured /> : <DatabaseUnavailable />;
  }

  const { totals, byStatus, recent } = loaded.data;

  const openApplications = PIPELINE.reduce((sum, stage) => sum + byStatus[stage.status], 0);
  const closedApplications = byStatus.REJECTED + byStatus.WITHDRAWN;
  const totalApplications = openApplications + closedApplications;
  const firstName = admin.fullName.trim().split(/\s+/)[0] || admin.fullName;

  return (
    /*
      A fragment, not a <main>: app/admin/layout.tsx draws the signed-in chrome
      and owns <main className="ws-main"> for every page under /admin. Only the
      DatabaseNotConfigured branch above wraps itself, because that is the one
      state in which the layout rendered no chrome at all.
    */
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Consult America admin</p>
          <h1>Recruitment overview</h1>
          <p>
            Welcome back, {firstName}. Every figure on this page was counted in the recruitment
            database when the page loaded.
          </p>
        </div>
        <Link className="ws-btn primary" href="/admin/jobs/new">
          New job
        </Link>
      </div>

      {notice ? (
        <p className={`ws-flash ${notice.tone === "error" ? "err" : "ok"}`} role="alert">
          {notice.message}
        </p>
      ) : null}

      {/* The explanation comes before the numbers it explains. */}
      {totals.totalJobs === 0 ? <NoJobsYet candidates={totals.candidates} /> : null}

      <div className="ws-stats">
        {/*
          The filter parameters are the ones the destination screens actually
          read, which are not the same word: /admin/jobs takes ?status=, and
          /admin/applications takes ?stage= (its "status" is per-application and
          it keeps the queue filter under a different name). Values are the
          canonical uppercase enums from lib/neon/types.ts, which is what both
          pages validate against.

          Those lists are being built in parallel with this page, so the links
          are written to degrade rather than break: an unrecognised parameter is
          ignored and the visitor still lands on the right section, unfiltered.
        */}
        <Link className="ws-stat" href="/admin/jobs?status=PUBLISHED">
          <strong>{totals.publishedJobs}</strong>
          <span>Published jobs</span>
        </Link>
        <Link className="ws-stat" href="/admin/jobs?status=DRAFT">
          <strong>{totals.draftJobs}</strong>
          <span>Draft jobs</span>
        </Link>
        <Link className="ws-stat" href="/admin/applications">
          <strong>{totalApplications}</strong>
          <span>Applications</span>
        </Link>
        <Link className="ws-stat" href="/admin/candidates">
          <strong>{totals.candidates}</strong>
          <span>Candidates</span>
        </Link>
      </div>

      <section className="ws-panel">
        <h2>Application pipeline</h2>
        <ul className="adm-pipeline">
          {PIPELINE.map((stage) => (
            <li key={stage.status}>
              <Link href={`/admin/applications?stage=${stage.status}`}>
                <strong>{byStatus[stage.status]}</strong>
                <span className={`ws-pill ${stage.tone}`}>{stage.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        {totalApplications === 0 ? (
          <p className="ws-table-caption">
            {totals.totalJobs === 0
              ? "Every stage is empty because there are no jobs to apply to yet."
              : totals.publishedJobs === 0
                ? `Every stage is empty because none of the ${totals.totalJobs} ${totals.totalJobs === 1 ? "job" : "jobs"} in the system is published, so candidates cannot see any of them.`
                : `Every stage is empty: ${totals.publishedJobs} ${totals.publishedJobs === 1 ? "role is" : "roles are"} published and nothing has been submitted against them yet.`}
          </p>
        ) : (
          <p className="ws-table-caption">
            {openApplications} open in the pipeline
            {closedApplications > 0
              ? `, plus ${closedApplications} closed (${byStatus.REJECTED} rejected, ${byStatus.WITHDRAWN} withdrawn), which are counted in the ${totalApplications} total above but kept out of the stages.`
              : ". No application has been rejected or withdrawn."}
          </p>
        )}
      </section>

      <section className="ws-panel">
        <h2>Latest applications</h2>
        {recent.length === 0 ? (
          <div className="ws-empty">
            <h2>Nothing has been submitted yet</h2>
            <p>
              {totals.totalJobs === 0
                ? "This fills in on its own once a published job starts receiving applications. Create a job to get there."
                : "This fills in on its own once a published job starts receiving applications. Check that the roles you expect to be live are in the Published status."}
            </p>
            <Link className="ws-btn primary" href={totals.totalJobs === 0 ? "/admin/jobs/new" : "/admin/jobs"}>
              {totals.totalJobs === 0 ? "Create the first job" : "Review jobs"}
            </Link>
          </div>
        ) : (
          <>
            <div className="ws-table-wrap">
              <table className="ws-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Recruiter</th>
                    <th>Applied</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((application) => {
                    const when = fmtWhen(application.applied_at);
                    return (
                      <tr key={application.id}>
                        <td>
                          <Link href={`/admin/applications/${application.id}`}>
                            {candidateName(application)}
                          </Link>
                          <div className="ws-muted">
                            {application.candidate_email} · {application.reference}
                          </div>
                        </td>
                        <td>
                          {application.job_title}
                          <div className="ws-muted">{application.job_reference}</div>
                        </td>
                        <td>
                          <span className={`ws-pill ${STATUS_TONES[application.status]}`}>
                            {STATUS_LABELS[application.status]}
                          </span>
                        </td>
                        <td className="ws-muted">
                          {application.assigned_recruiter_name ?? "Unassigned"}
                        </td>
                        <td className="ws-muted" title={when.iso}>
                          {when.text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="ws-table-caption">
              {totalApplications > recent.length
                ? `The ${recent.length} most recent of ${totalApplications}. `
                : `All ${totalApplications} ${totalApplications === 1 ? "application" : "applications"}. `}
              <Link href="/admin/applications">Open the full queue</Link>
            </p>
          </>
        )}
      </section>
    </>
  );
}
