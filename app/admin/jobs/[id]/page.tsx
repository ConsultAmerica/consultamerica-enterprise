import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminJobRowActions } from "@/components/admin/AdminJobRowActions";
import { ResumeLink } from "@/components/admin/ResumeLink";
import { findById } from "@/lib/neon/admin-users";
import { requireAdmin } from "@/lib/neon/auth";
import { NeonConfigError, query } from "@/lib/neon/client";
import { getJobById } from "@/lib/neon/jobs";
import type { ApplicationStatus, JobRow, JobStatus } from "@/lib/neon/types";

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

/**
 * TIMESTAMPTZ is documented as arriving as a Date, and JobApplicant says so.
 * The string branch is defensive for the same reason the application screens
 * normalise: if that assumption is ever wrong, Intl raises and the whole job
 * page 500s instead of one cell reading "—".
 */
function asDate(value: Date | string | null | undefined): Date | null {
  const date =
    value instanceof Date ? value : typeof value === "string" && value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** Date only, to keep applicant rows one line tall. The <time> carries the rest. */
const APPLIED_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * Pill tone per hiring stage. Duplicated from the application screens for the
 * reason documented in app/admin/applications/page.tsx: the natural shared home
 * is a "use client" module, and a server component cannot read a value out of
 * one.
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

/**
 * A clickable address, or null. Same rule as the application detail page: the
 * character class excludes whitespace, quotes, brackets, `?`, `&` and `%`, which
 * is what stops a candidate-supplied address smuggling extra mailto headers
 * (`?subject=`, `?bcc=`) into the recruiter's compose window. A value that fails
 * is rendered as plain text so it can still be read and copied.
 */
const MAILTO_SAFE =
  /^[^\s<>"'`()[\],;:\\?&%]+@[^\s<>"'`()[\],;:\\?&%]+\.[^\s<>"'`()[\],;:\\?&%]+$/;

function mailtoHref(email: string): string | null {
  const value = email.trim();
  return MAILTO_SAFE.test(value) ? `mailto:${value}` : null;
}

/**
 * A tel: URI from free text. The display keeps whatever the candidate typed;
 * the href keeps only digits and a leading +, which is what a dialler can use.
 * Under seven digits is not a callable number, so it stays plain text rather
 * than becoming a link that fails silently on a phone.
 */
function telHref(phone: string): string | null {
  const normalized = phone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return normalized.replace(/\D/g, "").length >= 7 ? `tel:${normalized}` : null;
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

/**
 * One row of the job's applicant table.
 *
 * Read with a direct `query` rather than through listApplications, for two
 * reasons: that helper does not select the candidate's phone number, and this
 * page already owned a direct count query for the same table. One read shaped
 * to this screen beats a list helper plus a per-row lookup for the phone.
 */
type JobApplicant = {
  id: string;
  reference: string;
  status: ApplicationStatus;
  applied_at: Date | null;
  resume_url: string | null;
  resume_filename: string | null;
  resume_size_bytes: number | null;
  candidate_first_name: string;
  candidate_last_name: string;
  candidate_email: string;
  candidate_phone: string | null;
};

/**
 * Enough to work a pipeline by hand, and a ceiling so a job that went viral
 * cannot turn this page into a ten-thousand-row render. The true total still
 * comes from the count query, so a truncated table says so.
 */
const APPLICANT_ROW_LIMIT = 200;

type LoadResult =
  | {
      ok: true;
      job: JobRow | null;
      applicants: number;
      applicantRows: JobApplicant[];
      createdBy: string | null;
    }
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
    if (!job) {
      return { ok: true, job: null, applicants: 0, applicantRows: [], createdBy: null };
    }

    const [counted, applicantRows, author] = await Promise.all([
      // Counted here rather than through lib/neon/applications.ts, which
      // exposes a global per-status count and a row listing but no per-job
      // total. One indexed count beats fetching rows to measure their length.
      //
      // Kept even though the rows are now read too: the rows are capped, so
      // this is what makes the headline number the real total rather than
      // "however many we chose to draw".
      query<{ count: number }>(
        "SELECT count(*)::int AS count FROM applications WHERE job_id = $1",
        [job.id],
      ),
      // The applicants themselves. One join, newest first — not a query per
      // row. Résumé columns come along for free because they live on the
      // application row, so the Résumé column costs no extra round trip.
      query<JobApplicant>(
        `SELECT a.id, a.reference, a.status, a.applied_at,
                a.resume_url, a.resume_filename, a.resume_size_bytes,
                c.first_name AS candidate_first_name,
                c.last_name  AS candidate_last_name,
                c.email      AS candidate_email,
                c.phone      AS candidate_phone
           FROM applications a
           JOIN candidates c ON c.id = a.candidate_id
          WHERE a.job_id = $1
          ORDER BY a.applied_at DESC
          LIMIT $2`,
        [job.id, APPLICANT_ROW_LIMIT],
      ),
      // created_by is a uuid and ON DELETE SET NULL, so it is both unreadable
      // on its own and legitimately absent for a job whose author has left.
      job.created_by ? findById(job.created_by) : Promise.resolve(null),
    ]);

    return {
      ok: true,
      job,
      applicants: counted[0]?.count ?? 0,
      applicantRows,
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

  const { job, applicants, applicantRows, createdBy } = loaded;
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

      {/* Placed above Record and the job copy deliberately: "who applied" is
          the question a recruiter opens a job to answer, and it should not sit
          below the full description. */}
      <ApplicantsPanel job={job} total={applicants} rows={applicantRows} />

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

/**
 * Who applied to this role.
 *
 * EVERY VALUE IN THIS TABLE EXCEPT THE STAGE AND THE DATE IS CANDIDATE-SUPPLIED
 * and is treated as hostile: names, emails, phone numbers and résumé filenames
 * all go through JSX text interpolation, which escapes them, and the mailto/tel
 * hrefs are pattern-checked above before they become links.
 */
function ApplicantsPanel({
  job,
  total,
  rows,
}: {
  job: JobRow;
  total: number;
  rows: JobApplicant[];
}) {
  return (
    <section className="ws-panel">
      <h2>
        Applicants{" "}
        <span className="ca-applicants-count">
          {total} applicant{total === 1 ? "" : "s"}
        </span>
      </h2>

      {rows.length === 0 ? (
        <EmptyApplicants job={job} />
      ) : (
        <>
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Contact</th>
                  <th>Resume</th>
                  <th>Stage</th>
                  <th>Applied</th>
                  <th>
                    {/* The action column needs no visible heading, but a screen
                        reader reading the row still needs to know what it is. */}
                    <span className="sr-only">Application</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  // first_name and last_name are NOT NULL but may be '' — the
                  // sparse re-application upsert depends on that — so the email
                  // is the fallback label rather than a blank cell.
                  const name =
                    `${row.candidate_first_name} ${row.candidate_last_name}`.trim() ||
                    row.candidate_email;
                  const email = mailtoHref(row.candidate_email);
                  const phone = row.candidate_phone ? telHref(row.candidate_phone) : null;
                  const applied = asDate(row.applied_at);

                  return (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/admin/applications/${row.id}`}>{name}</Link>
                        <div className="ws-muted">{row.reference}</div>
                      </td>
                      <td>
                        <div>
                          {email ? (
                            <a href={email}>{row.candidate_email}</a>
                          ) : (
                            row.candidate_email
                          )}
                        </div>
                        <div className="ws-muted">
                          {row.candidate_phone ? (
                            phone ? (
                              <a href={phone}>{row.candidate_phone}</a>
                            ) : (
                              row.candidate_phone
                            )
                          ) : (
                            "No phone given"
                          )}
                        </div>
                      </td>
                      <td className="ca-resume-cell">
                        <ResumeLink
                          applicationId={row.id}
                          resumeUrl={row.resume_url}
                          filename={row.resume_filename}
                          sizeBytes={row.resume_size_bytes}
                          showSize={false}
                        />
                      </td>
                      <td>
                        <span className={`ws-pill ${stageTone(row.status)}`.trim()}>
                          {humanizeEnum(row.status)}
                        </span>
                      </td>
                      <td className="ws-muted">
                        {applied ? (
                          <time dateTime={applied.toISOString()}>
                            {APPLIED_DATE.format(applied)}
                          </time>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <Link className="ws-btn" href={`/admin/applications/${row.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {total > rows.length ? (
            <p className="ws-table-caption">
              Showing the {rows.length} most recent of {total} applications.{" "}
              <Link href={`/admin/applications?job=${encodeURIComponent(job.id)}`}>
                Open the full queue for this role
              </Link>{" "}
              to search and filter the rest.
            </p>
          ) : (
            <p className="ws-table-caption">
              <Link href={`/admin/applications?job=${encodeURIComponent(job.id)}`}>
                Open these in the applications queue
              </Link>{" "}
              to filter by stage or assign a recruiter.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Nothing has applied yet — and the reason matters.
 *
 * A draft or archived role cannot receive an application at all:
 * submitApplication refuses anything whose status is not PUBLISHED. Telling an
 * admin "no applicants" without telling them the role is not even live would
 * leave them waiting on a queue that can never fill.
 */
function EmptyApplicants({ job }: { job: JobRow }) {
  const isPublic = job.status === "PUBLISHED";

  return (
    <div className="ws-empty">
      <h3 className="ca-applicants-empty-title">No applicants yet</h3>
      {isPublic ? (
        <p>
          This role is published, so it can receive applications. Anyone who applies at{" "}
          <Link href={`/jobs/${job.slug}`}>/jobs/{job.slug}</Link> appears here straight away,
          newest first, with their contact details and résumé.
        </p>
      ) : (
        <p>
          This role is {humanizeEnum(job.status).toLowerCase()}, so it cannot receive any
          applications: the careers site only accepts submissions against a published role, and
          the apply form refuses anything else. Publish it to start collecting applicants.
        </p>
      )}
    </div>
  );
}
