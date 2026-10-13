import Link from "next/link";

import { Avatar } from "@/components/admin/Avatar";
import { countApplicationsByStatus } from "@/lib/neon/applications";
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
 * Recruitment Overview — the executive view of the hiring desk.
 *
 * THE SHAPE: four KPI cards, the hiring pipeline, and the applications waiting
 * on a decision. Everything a recruiter or an owner needs to see before they
 * choose which of the other three screens to open.
 *
 * WHAT THIS REPLACED, AND WHAT SURVIVED. The previous version was a dark
 * instrument panel that led with waiting time and drew an animated ageing rail
 * on every row. The underlying judgement was right and is kept: waiting time
 * is the only figure here that represents an obligation rather than a
 * statistic. What changed is how it speaks. "Needs review" is now a KPI, the
 * review list is still ordered longest-wait-first without announcing it, and a
 * wait past the service promise raises a plain alert instead of a coloured
 * meter. Business language, not instrumentation.
 *
 * STILL A SERVER COMPONENT, WITH NO CLIENT BOUNDARY. Nothing here holds state.
 * Waits are computed in Postgres rather than the browser so the figures cannot
 * disagree with the clock that stamped the rows, and so React has no hydration
 * mismatch to report on a page whose numbers are the point.
 *
 * Every number is counted in Postgres during this request. Nothing is cached,
 * sampled, or defaulted when a read fails: when a query cannot be completed the
 * page says so instead of printing a zero, because a fabricated zero on a
 * recruitment dashboard reads as "no applicants" and that is a
 * decision-changing lie.
 *
 * The guard is here rather than in app/admin/layout.tsx, which also wraps the
 * sign-in and password-reset pages; see the comment in that file.
 */
export const metadata = { title: "Recruitment Overview" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * The pipeline, in the order an application moves through it. REJECTED and
 * WITHDRAWN are counted as well but reported separately: folding closed
 * applications into these six would make the figures read as open work.
 */
/**
 * "Good morning" and friends, from the server's clock.
 *
 * Three bands rather than four. "Good night" is not a greeting anybody wants
 * when they have just sat down to work at 11pm, and the boundary between
 * evening and night is the one people disagree about most.
 */
function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The width every pipeline stage gets before any applications are counted.
 *
 * Tuned, not arbitrary. At 2 the six stages start from a combined 12 units, so
 * a desk holding a dozen applications splits roughly half the row by share and
 * half evenly: the shape leans toward the truth without any stage collapsing.
 * Lower and an empty stage becomes a sliver too narrow for its own label;
 * higher and the whole thing flattens back into the six equal boxes this
 * replaced.
 */
const FLOW_FLOOR = 2;

const PIPELINE: readonly { status: ApplicationStatus; label: string }[] = [
  { status: "NEW", label: "New" },
  { status: "SCREENING", label: "Screening" },
  { status: "INTERVIEW", label: "Interview" },
  { status: "SHORTLISTED", label: "Shortlisted" },
  { status: "OFFER", label: "Offer" },
  { status: "HIRED", label: "Hired" },
];

/**
 * The stages that count as "waiting on us".
 *
 * NEW and SCREENING only. An application at interview or offer is mid-process
 * with dates in the diary, and counting it as unreviewed would inflate the
 * number that is supposed to mean "nobody has looked at this yet".
 */
const REVIEW_STATUSES: readonly ApplicationStatus[] = ["NEW", "SCREENING"];

/** How many of the longest-waiting applications the overview lists. */
const REVIEW_LIMIT = 8;

/**
 * Days an application may wait before the alert fires. The banner quotes this
 * constant rather than repeating the number, so threshold and copy cannot
 * drift apart.
 */
const SLA_DAYS = 7;

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
 * no countJobsByStatus or countCandidates. The available readers are listJobs()
 * and listCandidates(), and both are LIMIT-capped — clampLimit() refuses
 * anything above 200 — so counting their rows would start silently
 * under-reporting at the 201st job with no indication on screen. An undercount
 * presented as a total is the kind of number someone makes a hiring decision
 * on, so this asks Postgres to do the counting instead.
 *
 * One statement rather than four: the HTTP transport costs a round trip per
 * statement, and scalar subqueries let a single trip answer all four cards.
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

type ReviewRow = {
  id: string;
  reference: string;
  status: ApplicationStatus;
  applied_at: Date | string;
  candidate_email: string;
  candidate_first_name: string;
  candidate_last_name: string;
  job_title: string;
  job_reference: string;
  /** Whole days this application has been waiting, computed by Postgres. */
  wait_days: number;
};

type ReviewQueue = {
  rows: ReviewRow[];
  /** Everything awaiting review, not just the page above. */
  total: number;
  /** How many of those are past SLA_DAYS. Counted over the whole set. */
  overdue: number;
};

/**
 * The applications waiting on a decision, longest wait first.
 *
 * TWO STATEMENTS, NOT ONE, AND THE SECOND IS THE IMPORTANT ONE. The list is
 * capped at REVIEW_LIMIT, so counting overdue rows inside it would describe the
 * page rather than the desk: with nine late applications and a limit of eight,
 * a banner built from the list would say eight. The aggregate counts the whole
 * table, so the alert is true regardless of how much of it is on screen.
 *
 * Waits are measured by Postgres against the clock that stamped applied_at, and
 * floored to whole days with date_trunc so a recruiter reads "9 days" and never
 * "8.6 days".
 */
async function loadReviewQueue(): Promise<ReviewQueue> {
  const [rows, counts] = await Promise.all([
    query<ReviewRow>(
      `SELECT a.id, a.reference, a.status, a.applied_at,
              c.email      AS candidate_email,
              c.first_name AS candidate_first_name,
              c.last_name  AS candidate_last_name,
              j.title      AS job_title,
              j.reference  AS job_reference,
              GREATEST(
                0,
                EXTRACT(DAY FROM date_trunc('day', now()) - date_trunc('day', a.applied_at))
              )::int AS wait_days
         FROM applications a
         JOIN candidates c ON c.id = a.candidate_id
         JOIN jobs j       ON j.id = a.job_id
        WHERE a.status = ANY($1::text[])
        ORDER BY a.applied_at ASC
        LIMIT $2`,
      [REVIEW_STATUSES, REVIEW_LIMIT],
    ),
    query<{ total: number; overdue: number }>(
      `SELECT count(*)::int AS total,
              (count(*) FILTER (WHERE a.applied_at < now() - ($2 || ' days')::interval))::int AS overdue
         FROM applications a
        WHERE a.status = ANY($1::text[])`,
      [REVIEW_STATUSES, SLA_DAYS],
    ),
  ]);

  const summary = counts[0] ?? { total: rows.length, overdue: 0 };
  return { rows, total: summary.total, overdue: summary.overdue };
}

type Dashboard = {
  totals: HeadlineTotals;
  byStatus: Record<ApplicationStatus, number>;
  review: ReviewQueue;
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
    const [totals, byStatus, review] = await Promise.all([
      loadHeadlineTotals(),
      countApplicationsByStatus(),
      loadReviewQueue(),
    ]);
    return { ok: true, data: { totals, byStatus, review } };
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

/*
 * Icons. Inline SVG rather than an icon font or a package: four glyphs do not
 * justify a dependency, and inlining means they inherit currentColor and
 * animate with the card they sit in.
 *
 * aria-hidden throughout. Every one of them sits next to a text label that
 * already says the same thing, so announcing them would make a screen reader
 * read each card twice.
 */
const ICON = {
  stroke: {
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  },
};

function BriefcaseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...ICON.stroke} aria-hidden>
      <rect x="2.5" y="7" width="19" height="13" rx="2.5" />
      <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M2.5 12.5h19" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...ICON.stroke} aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...ICON.stroke} aria-hidden>
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
      <circle cx="10" cy="8" r="3.2" />
      <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.4 5.2a3.2 3.2 0 0 1 0 5.6" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...ICON.stroke} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M11 8v3.2l2 1.3M20 20l-3.6-3.6" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...ICON.stroke} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16.2v.1" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" {...ICON.stroke} aria-hidden>
      <path d="M3 13h4l1.6 2.6h6.8L17 13h4" />
      <path d="M5.4 5h13.2l2.4 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4z" />
    </svg>
  );
}

const ARROW = (
  <svg width="13" height="13" viewBox="0 0 24 24" {...ICON.stroke} strokeWidth={2.2} aria-hidden>
    <path d="M5 12h13M12 5.5 18.5 12 12 18.5" />
  </svg>
);

/**
 * Dates render on the server, so they carry the server's timezone (UTC on
 * Vercel). The full ISO timestamp goes in a title attribute rather than being
 * dropped, so "which of these two arrived first" is always answerable.
 *
 * Typed to accept a string as well as a Date: the row types in lib/neon/types.ts
 * declare Date, and the driver does parse timestamptz into one, but a formatter
 * that fell over on a string would turn a driver-configuration change into a
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

/** "Today", "1 day", "6 days" — the wait, in words, for a table cell. */
function waitLabel(days: number): string {
  if (days <= 0) return "Today";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * candidates.first_name and last_name are allowed to be '' by design (see the
 * note at the end of db/neon/002_fixes.sql), so a row can legitimately have no
 * name. The email is always present and unique, so it is the honest fallback —
 * better than an empty link nobody can click accurately.
 */
function candidateName(row: ReviewRow): string {
  const name = [row.candidate_first_name, row.candidate_last_name]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  return name || row.candidate_email;
}

/**
 * Rendered when DATABASE_URL is missing, which is the state of any deploy where
 * the Neon integration was never attached.
 *
 * Self-contained, with its own .ws and .ws-main: in this state
 * app/admin/layout.tsx cannot read the session either, so it renders no chrome
 * and this panel is the entire page.
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
            <p className="ws-eyebrow">Consult America / Recruitment</p>
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
          <p className="ws-eyebrow">Consult America / Recruitment</p>
          <h1>Recruitment Overview</h1>
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
 * Shown above the figures when the jobs table has no rows, because every number
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
          screening, interview, shortlist and offer to hired.
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

  const { totals, byStatus, review } = loaded.data;

  const openApplications = PIPELINE.reduce((sum, stage) => sum + byStatus[stage.status], 0);
  const closedApplications = byStatus.REJECTED + byStatus.WITHDRAWN;
  const totalApplications = openApplications + closedApplications;

  return (
    /*
      A fragment-rooted <div>, not a <main>: app/admin/layout.tsx draws the
      signed-in chrome and owns <main className="ws-main"> for every page under
      /admin. Only the DatabaseNotConfigured branch above wraps itself, because
      that is the one state in which the layout rendered no chrome at all.
    */
    <div className="rov">
      <div className="rov-head">
        <div>
          {/*
            A greeting, which is the one line on this page that is about the
            person rather than the pipeline. Salesforce opens the same way, and
            it is doing more than being friendly: it marks the top of the page
            as a place you arrived at rather than a report you were handed.

            Computed on the server from the request's own clock, so it cannot
            produce a hydration mismatch the way a browser-side new Date()
            would when the server and the reader are in different hours.
          */}
          <p className="rov-greeting">{greeting()} </p>
          <h1>Recruitment Overview</h1>
          <p>
            Manage job openings, review applications, and track candidates throughout the hiring
            process.
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

      {/*
        The only status message on the page, and it exists only when something
        is actually late. A permanent "all is well" line is a line people stop
        reading, which makes it worthless on the day it changes.
      */}
      {review.overdue > 0 ? (
        <p className="rov-alert" role="status">
          <span className="rov-alert-icon">
            <AlertIcon />
          </span>
          <span>
            <strong>
              {review.overdue} {review.overdue === 1 ? "application has" : "applications have"} been
              waiting more than {SLA_DAYS} days
            </strong>{" "}
            for a first review.
          </span>
          <Link href="/admin/applications?stage=NEW">Review now {ARROW}</Link>
        </p>
      ) : null}

      <div className="rov-kpis">
        {/*
          The filter parameters are the ones the destination screens read, which
          are not the same word: /admin/jobs takes ?status= and
          /admin/applications takes ?stage=. Values are the canonical uppercase
          enums from lib/neon/types.ts, which is what both pages validate
          against; an unrecognised parameter is ignored and the visitor still
          lands on the right section, unfiltered.
        */}
        <Link className="rov-kpi" href="/admin/jobs?status=PUBLISHED">
          <span className="rov-kpi-top">
            <span className="rov-kpi-icon">
              <BriefcaseIcon />
            </span>
            <span className="rov-kpi-label">Published jobs</span>
          </span>
          <strong className="rov-kpi-value">{totals.publishedJobs}</strong>
          <span className="rov-kpi-note">
            {totals.draftJobs} {totals.draftJobs === 1 ? "draft" : "drafts"} not yet live
          </span>
        </Link>

        <Link className="rov-kpi" href="/admin/applications">
          <span className="rov-kpi-top">
            <span className="rov-kpi-icon">
              <DocumentIcon />
            </span>
            <span className="rov-kpi-label">Applications</span>
          </span>
          <strong className="rov-kpi-value">{totalApplications}</strong>
          <span className="rov-kpi-note">
            {closedApplications > 0
              ? `${openApplications} open · ${closedApplications} closed`
              : `${openApplications} open`}
          </span>
        </Link>

        <Link className="rov-kpi" href="/admin/candidates">
          <span className="rov-kpi-top">
            <span className="rov-kpi-icon">
              <PeopleIcon />
            </span>
            <span className="rov-kpi-label">Candidates</span>
          </span>
          <strong className="rov-kpi-value">{totals.candidates}</strong>
          <span className="rov-kpi-note">In the talent database</span>
        </Link>

        {/*
          The action card. Distinguished by a tinted icon and a blue figure
          rather than a filled background: it sits in a row of four and a solid
          block would unbalance the set. At zero it looks like its neighbours,
          because then there is nothing to act on.
        */}
        <Link
          className={`rov-kpi${review.total > 0 ? " is-action" : ""}`}
          href="/admin/applications?stage=NEW"
        >
          <span className="rov-kpi-top">
            <span className="rov-kpi-icon">
              <ReviewIcon />
            </span>
            <span className="rov-kpi-label">Needs review</span>
          </span>
          <strong className="rov-kpi-value">{review.total}</strong>
          <span className="rov-kpi-note">
            {review.total === 0
              ? "Nothing awaiting a first look"
              : review.overdue > 0
                ? `${review.overdue} past ${SLA_DAYS} days`
                : "Awaiting a first look"}
          </span>
        </Link>
      </div>

      <section className="rov-card" aria-labelledby="rov-pipeline-h">
        <div className="rov-card-head">
          <h2 id="rov-pipeline-h">Hiring pipeline</h2>
          <p>
            {openApplications} {openApplications === 1 ? "application" : "applications"} in progress
          </p>
        </div>
        {/*
          A FUNNEL, SIZED BY WHAT IS IN IT.

          This was six equal chevrons, which meant the shape said nothing: a
          stage holding five and a stage holding zero drew the same box, and the
          only real information was in the numerals. Width now carries the
          count, the way a funnel chart does, so the silhouette is readable
          before a single digit is.

          THE FLOOR IS WHY THIS WORKS AT ALL. A share-of-total width alone would
          give an empty stage zero pixels and an unclickable, unlabelled target,
          and would make a stage holding one out of fifty a sliver too thin to
          hit. Every stage keeps a floor and the remaining width is shared out by
          count, so the ordering stays truthful while the control stays usable.
          A stage you cannot click is worse than a chart that is slightly less
          literal.

          flex-grow is the mechanism rather than a percentage width, so the row
          fills its container exactly at any size without the rounding drift
          that six computed percentages produce.
        */}
        <ol className="rov-flow">
          {PIPELINE.map((stage) => {
            const count = byStatus[stage.status];
            return (
              <li
                key={stage.status}
                className={count === 0 ? "is-zero" : ""}
                style={{ flexGrow: FLOW_FLOOR + count }}
              >
                <Link
                  href={`/admin/applications?stage=${stage.status}`}
                  aria-label={`${count} at ${stage.label}`}
                >
                  <span className="rov-flow-n">{count}</span>
                  <span className="rov-flow-l">{stage.label}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rov-card" aria-labelledby="rov-review-h">
        <div className="rov-card-head">
          <h2 id="rov-review-h">Applications requiring review</h2>
          <Link className="rov-card-link" href="/admin/applications?stage=NEW">
            View all {ARROW}
          </Link>
        </div>

        {review.rows.length === 0 ? (
          <div className="rov-empty">
            <span className="rov-empty-icon">
              <InboxIcon />
            </span>
            <h3>Nothing is waiting for a review</h3>
            <p>
              {totals.totalJobs === 0
                ? "This fills in once a published job starts receiving applications. Create a job to get there."
                : totals.publishedJobs === 0
                  ? `None of the ${totals.totalJobs} ${totals.totalJobs === 1 ? "job" : "jobs"} in the system is published, so candidates cannot see any of them to apply.`
                  : "Every new application has been picked up. Submissions appear here as they arrive."}
            </p>
          </div>
        ) : (
          <>
            <table className="rov-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th className="rov-role-cell">Role</th>
                  <th>Applied</th>
                  {/* The action column. Headed by a screen-reader-only label
                      rather than left blank, so the table still has a name for
                      every column it renders. */}
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {review.rows.map((row) => {
                  const when = fmtWhen(row.applied_at);
                  const name = candidateName(row);
                  const late = row.wait_days >= SLA_DAYS;
                  return (
                    <tr key={row.id}>
                      <td>
                        <span className="rov-who">
                          <Avatar name={name} seed={row.candidate_email} />
                          <span className="rov-who-text">
                            <Link className="rov-name" href={`/admin/applications/${row.id}`}>
                              {name}
                            </Link>
                            <span className="rov-sub">{row.reference}</span>
                            {/* Visible only on the narrowest layout, where the
                                role column is dropped; see the stylesheet. */}
                            <span className="rov-role-inline">{row.job_title}</span>
                          </span>
                        </span>
                      </td>
                      <td className="rov-role-cell">
                        <span className="rov-role">{row.job_title}</span>
                        <span className="rov-sub">{row.job_reference}</span>
                      </td>
                      <td>
                        <span className="rov-when" title={when.iso}>
                          {when.text}
                        </span>
                        <span className={`rov-wait${late ? " is-late" : ""}`}>
                          {waitLabel(row.wait_days)}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="rov-open"
                          href={`/admin/applications/${row.id}`}
                          aria-label={`Review ${name} for ${row.job_title}`}
                        >
                          Review {ARROW}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {review.total > review.rows.length ? (
              <p className="rov-foot">
                Showing {review.rows.length} of {review.total} awaiting review.{" "}
                <Link href="/admin/applications?stage=NEW">View all</Link>
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
