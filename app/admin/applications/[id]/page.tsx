/**
 * One application, as a recruiter works it: who the person is, how to reach
 * them, what they sent, what stage they are in, who owns it, what was said
 * about them, and what has happened to the record.
 *
 * Reading order on the screen is deliberate. The stage rail is first, because
 * "where is this candidate" is the question the page exists to answer. Contact
 * details come next, as a mailto and a tel link, because the next thing a
 * recruiter does after reading a stage is pick up the phone. The audit trail is
 * last, because it is read occasionally and never acted on.
 *
 * EVERY STRING ON THIS PAGE EXCEPT OUR OWN LABELS IS CANDIDATE-SUPPLIED and is
 * treated as hostile: all of it goes through JSX text interpolation, which
 * escapes it, and every URL is parsed and protocol-checked before it becomes an
 * href so a stored `javascript:` value cannot be clicked.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationNotes } from "@/components/admin/ApplicationNotes";
import {
  ApplicationRecruiterSelect,
  ApplicationStageControl,
} from "@/components/admin/ApplicationStageControl";
import { listAdminUsers } from "@/lib/neon/admin-users";
import { getApplicationDetail } from "@/lib/neon/applications";
import { requireAdmin } from "@/lib/neon/auth";
import { NeonConfigError } from "@/lib/neon/client";
import type { ActivityKind, ApplicationStatus } from "@/lib/neon/types";

export const metadata: Metadata = {
  title: "Application",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/**
 * Both formatters are server-side and fixed to en-US. The long one carries its
 * own timezone name: the CRM is read by people in different places and an
 * unlabelled "2:30 PM" on an audit trail is worse than no time at all.
 */
const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/**
 * TIMESTAMPTZ is documented as arriving as a Date (see the header of
 * lib/neon/types.ts) and the row types say so. The string branch is defensive
 * for the same reason lib/neon/admin-users.ts normalises: if the assumption is
 * ever wrong, Intl raises and the whole screen becomes a 500 instead of one
 * cell reading "—".
 */
function asDate(value: Date | string | null | undefined): Date | null {
  const date = value instanceof Date ? value : typeof value === "string" && value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function fmtDate(value: Date | string | null): string {
  const date = asDate(value);
  return date ? DATE.format(date) : "—";
}

function fmtDateTime(value: Date | string | null): string {
  const date = asDate(value);
  return date ? DATE_TIME.format(date) : "—";
}

/** A timestamp as a machine-readable <time>, which is what an audit trail wants. */
function When({ value }: { value: Date | string | null }) {
  const date = asDate(value);
  if (!date) return <span className="ws-muted">—</span>;
  return <time dateTime={date.toISOString()}>{DATE_TIME.format(date)}</time>;
}

/** See the note in app/admin/applications/page.tsx on why this is duplicated. */
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

/** ALL_CAPS_ENUM to "All caps enum". Used for stored values, not for our copy. */
function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Timeline labels. Keyed by the kind CHECK list, with a humanised fallback so a
 * kind added to the schema later renders as readable text rather than vanishing
 * from the audit trail.
 */
const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  APPLIED: "Applied",
  STATUS_CHANGED: "Stage changed",
  NOTE_ADDED: "Note added",
  RECRUITER_ASSIGNED: "Recruiter assigned",
  EMAIL_SENT: "Email sent",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  INTERVIEW_COMPLETED: "Interview completed",
  CRM_SYNCED: "Synced to Zoho CRM",
};

const INTERVIEW_KIND_LABELS: Record<string, string> = {
  AI_SCREEN: "AI screen",
  PHONE: "Phone",
  TECHNICAL: "Technical",
  PANEL: "Panel",
  FINAL: "Final",
};

/**
 * A clickable address, or null.
 *
 * The character class excludes whitespace, quotes, brackets, `?`, `&` and `%`,
 * which is what stops a stored address from smuggling extra mailto headers
 * (`?subject=`, `?bcc=`) into the recruiter's compose window or percent-encoding
 * its way around this check. A value that fails is rendered as plain text, so
 * the recruiter can still read and copy it.
 */
const MAILTO_SAFE = /^[^\s<>"'`()[\],;:\\?&%]+@[^\s<>"'`()[\],;:\\?&%]+\.[^\s<>"'`()[\],;:\\?&%]+$/;

function mailtoHref(email: string): string | null {
  const value = email.trim();
  return MAILTO_SAFE.test(value) ? `mailto:${value}` : null;
}

/**
 * A tel: URI from free text.
 *
 * Phone numbers arrive as whatever the candidate typed — "(703) 555 0100 x12",
 * "+44 20 7946 0958". The display keeps their formatting; the href keeps only
 * the digits and a leading +, which is what a dialler can use. Under seven
 * digits is not a number anyone can call, so it stays plain text rather than
 * becoming a link that fails silently on a phone.
 */
function telHref(phone: string): string | null {
  const normalized = phone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 7 ? `tel:${normalized}` : null;
}

/**
 * Only http(s) URLs become links. resume_url is written by our own upload path,
 * but linkedin_url and portfolio_url are typed by the candidate, and a
 * `javascript:` or `data:` href in a recruiter's browser is a stored XSS.
 */
function httpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Zoho record ids are numeric strings. Anything else is not linked. */
function zohoContactUrl(zohoContactId: string): string | null {
  return /^\d{6,30}$/.test(zohoContactId)
    ? // The data centre host is not stored anywhere yet (zoho_oauth_tokens keeps
      // api_domain, which is an API host, not the CRM UI), and crm.zoho.com
      // redirects a signed-in user to their own region.
      `https://crm.zoho.com/crm/tab/Contacts/${zohoContactId}`
    : null;
}

function fileSize(bytes: number | null): string | null {
  if (bytes === null || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function AdminApplicationDetailPage({ params }: Props) {
  const { id } = await params;

  type Loaded = Awaited<ReturnType<typeof load>>;
  async function load() {
    const [detail, admins] = await Promise.all([
      getApplicationDetail(id),
      // Everyone, including deactivated accounts: an application assigned to
      // someone who has since left must still show who owns it, and the select
      // below marks those options rather than dropping them.
      listAdminUsers({ includeInactive: true }),
    ]);
    return { detail, admins };
  }

  let loaded: Loaded | null = null;
  try {
    await requireAdmin({ returnTo: `/admin/applications/${id}` });
    loaded = await load();
  } catch (error) {
    if (!(error instanceof NeonConfigError)) throw error;
    return (
      <main className="ws-main">
        <div className="ws-head">
          <div>
            <p className="ws-eyebrow">Recruitment</p>
            <h1>Application</h1>
          </div>
        </div>
        <section className="ws-panel">
          <div className="ws-empty">
            <h2>The recruitment database is not configured</h2>
            <p>
              No Neon connection string is set on this deployment, so this application cannot be
              read. Set <strong>DATABASE_URL</strong> (or <strong>POSTGRES_URL</strong>) to the
              Neon pooled connection string and reload. Locally, copy it into{" "}
              <strong>.env.local</strong>.
            </p>
          </div>
        </section>
      </main>
    );
  }

  // getApplicationDetail screens a malformed id itself and returns null, so a
  // hand-typed URL is a 404 rather than a 500.
  if (!loaded.detail) notFound();
  const { application, candidate, job, notes, activities, interviews } = loaded.detail;

  const name = `${candidate.first_name} ${candidate.last_name}`.trim() || candidate.email;
  const email = mailtoHref(candidate.email);
  const phone = candidate.phone ? telHref(candidate.phone) : null;
  const linkedin = httpUrl(candidate.linkedin_url);
  const portfolio = httpUrl(candidate.portfolio_url);
  const resume = httpUrl(application.resume_url);
  const resumeSize = fileSize(application.resume_size_bytes);
  const zoho = candidate.zoho_contact_id ? zohoContactUrl(candidate.zoho_contact_id) : null;

  const recruiters = loaded.admins.map((admin) => ({
    id: admin.id,
    name: admin.fullName,
    isActive: admin.isActive,
  }));

  return (
    <main className="ws-main">
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">
            <Link href="/admin/applications">Applications</Link> / {application.reference}
          </p>
          <h1>{name}</h1>
          <p>
            Applied for {job.title} ({job.reference}) on {fmtDate(application.applied_at)}.
          </p>
        </div>
        <nav className="ca-crm-nav" aria-label="Related records">
          <Link className="ws-btn" href={`/admin/candidates/${candidate.id}`}>
            Candidate record
          </Link>
          <Link className="ws-btn" href="/admin/applications">
            Back to queue
          </Link>
        </nav>
      </div>

      <section className="ws-panel">
        <h2>Hiring stage</h2>
        <ApplicationStageControl
          applicationId={application.id}
          status={application.status}
          candidateName={name}
        />
      </section>

      <div className="ws-grid-wide ca-crm-grid">
        <div>
          <section className="ws-panel">
            <h2>Candidate</h2>
            <dl className="ws-dl">
              <dt>Name</dt>
              <dd>{name}</dd>
              <dt>Email</dt>
              <dd>
                {/* A link, not text: contacting the candidate from this screen
                    was an explicit requirement. */}
                {email ? <a href={email}>{candidate.email}</a> : candidate.email}
              </dd>
              <dt>Phone</dt>
              <dd>
                {candidate.phone ? (
                  phone ? (
                    <a href={phone}>{candidate.phone}</a>
                  ) : (
                    candidate.phone
                  )
                ) : (
                  <span className="ws-muted">Not given</span>
                )}
              </dd>
              <dt>Location</dt>
              <dd>{candidate.location || <span className="ws-muted">Not given</span>}</dd>
              <dt>LinkedIn</dt>
              <dd>
                {linkedin ? (
                  <a href={linkedin} target="_blank" rel="noopener noreferrer">
                    {candidate.linkedin_url}
                  </a>
                ) : (
                  <span className="ws-muted">Not given</span>
                )}
              </dd>
              <dt>Portfolio</dt>
              <dd>
                {portfolio ? (
                  <a href={portfolio} target="_blank" rel="noopener noreferrer">
                    {candidate.portfolio_url}
                  </a>
                ) : (
                  <span className="ws-muted">Not given</span>
                )}
              </dd>
              {/* Rendered only when the CRM id exists. The integration is not
                  connected yet, so the alternative would be a dead link on
                  every record. */}
              {zoho ? (
                <>
                  <dt>Zoho CRM</dt>
                  <dd>
                    <a href={zoho} target="_blank" rel="noopener noreferrer">
                      Open contact {candidate.zoho_contact_id}
                    </a>
                  </dd>
                </>
              ) : null}
            </dl>
          </section>

          <section className="ws-panel">
            <h2>Application</h2>
            <dl className="ws-dl">
              <dt>Role</dt>
              <dd>
                <Link href={`/admin/jobs?q=${encodeURIComponent(job.reference)}`}>
                  {job.title}
                </Link>
                <div className="ws-muted">
                  {[job.department, job.location, humanize(job.workplace_type)]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </dd>
              <dt>Job reference</dt>
              <dd>{job.reference}</dd>
              <dt>Application reference</dt>
              <dd>{application.reference}</dd>
              <dt>Applied</dt>
              <dd>
                <When value={application.applied_at} />
              </dd>
              <dt>Source</dt>
              <dd>{application.source}</dd>
              <dt>Stage</dt>
              <dd>
                <span className={`ws-pill ${stageTone(application.status)}`.trim()}>
                  {humanize(application.status)}
                </span>
              </dd>
              <dt>Résumé</dt>
              <dd>
                {resume ? (
                  <>
                    <a href={resume} target="_blank" rel="noopener noreferrer">
                      {application.resume_filename || "Open résumé"}
                    </a>
                    {resumeSize ? <div className="ws-muted">{resumeSize}</div> : null}
                  </>
                ) : (
                  <span className="ws-muted">
                    No résumé is attached to this application.
                    {application.resume_url
                      ? " The stored file link is not a usable web address."
                      : ""}
                  </span>
                )}
              </dd>
            </dl>

            {application.relevant_experience ? (
              <>
                <h3>Relevant experience</h3>
                <p className="ca-crm-prose">{application.relevant_experience}</p>
              </>
            ) : null}
            {application.additional_info ? (
              <>
                <h3>Additional information</h3>
                <p className="ca-crm-prose">{application.additional_info}</p>
              </>
            ) : null}
          </section>

          <section className="ws-panel">
            <h2>Notes</h2>
            <ApplicationNotes
              applicationId={application.id}
              notes={notes.map((note) => {
                const created = asDate(note.created_at);
                return {
                  id: note.id,
                  body: note.body,
                  authorName: note.author_name,
                  // Formatted here, on the server, so the client component
                  // cannot produce a hydration mismatch from a different
                  // timezone or locale.
                  createdAtLabel: created ? DATE_TIME.format(created) : "—",
                  createdAtIso: created?.toISOString() ?? "",
                };
              })}
            />
          </section>

          <section className="ws-panel">
            <h2>Activity</h2>
            {/* Read-only by design. application_activities is append-only: it is
                the audit trail, so this screen offers no way to edit or remove
                an entry and must never grow one. */}
            {activities.length === 0 ? (
              <p className="ws-muted">
                Nothing recorded yet. Every stage change, note and assignment is logged here
                automatically.
              </p>
            ) : (
              <ol className="ws-list ca-crm-timeline">
                {activities.map((activity) => (
                  <li key={activity.id}>
                    <p className="ca-crm-timeline-head">
                      <strong>{ACTIVITY_LABELS[activity.kind] ?? humanize(activity.kind)}</strong>
                      {activity.from_status || activity.to_status ? (
                        <>
                          {" "}
                          <span className="ws-muted">
                            {activity.from_status ? humanize(activity.from_status) : "—"} &rarr;{" "}
                            {activity.to_status ? humanize(activity.to_status) : "—"}
                          </span>
                        </>
                      ) : null}
                    </p>
                    {activity.detail ? (
                      <p className="ca-crm-timeline-detail">{activity.detail}</p>
                    ) : null}
                    <p className="ws-muted">
                      {/* Null actor is a real case, not missing data: the
                          candidate's own submission has no admin behind it. */}
                      {activity.actor_name ?? "Candidate or system"}
                      {" · "}
                      <When value={activity.created_at} />
                    </p>
                  </li>
                ))}
              </ol>
            )}
            <p className="ws-note">
              This timeline is the audit trail for the application. Entries are written
              automatically and are never edited or deleted.
            </p>
          </section>
        </div>

        <div>
          <section className="ws-panel">
            <h2>Owner</h2>
            <ApplicationRecruiterSelect
              applicationId={application.id}
              assignedRecruiterId={application.assigned_recruiter_id}
              recruiters={recruiters}
            />
            <p className="ws-note">
              Assigning or unassigning is recorded on the timeline, so ownership of a candidate
              is always accountable.
            </p>
          </section>

          <section className="ws-panel">
            <h2>Interviews</h2>
            {interviews.length === 0 ? (
              <p className="ws-muted">No interviews are recorded against this application.</p>
            ) : (
              <ul className="ws-list">
                {interviews.map((interview) => (
                  <li key={interview.id}>
                    <p>
                      <strong>
                        {INTERVIEW_KIND_LABELS[interview.kind] ?? humanize(interview.kind)}
                      </strong>{" "}
                      <span className="ws-pill">{humanize(interview.status)}</span>
                    </p>
                    <p className="ws-muted">
                      {interview.scheduled_at
                        ? `Scheduled ${fmtDateTime(interview.scheduled_at)}`
                        : "Not scheduled"}
                      {interview.completed_at
                        ? ` · Completed ${fmtDateTime(interview.completed_at)}`
                        : ""}
                    </p>
                    {/* NUMERIC arrives as a string from the driver and is shown
                        as stored: parsing it to a float to re-print it could
                        only lose precision. */}
                    {interview.score ? (
                      <p className="ws-score">
                        <strong>{interview.score}</strong> <span className="ws-muted">score</span>
                      </p>
                    ) : null}
                    {interview.summary ? (
                      <p className="ca-crm-prose">{interview.summary}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="ws-note">
              ConsultHire AI interview results attach here. The schema already carries the link
              (interviews.consulthire_interview_id, score and summary); nothing writes to it yet,
              so this section only ever shows interviews that genuinely exist.
            </p>
          </section>

          <section className="ws-panel">
            <h2>CRM sync</h2>
            <dl className="ws-dl">
              <dt>Last synced</dt>
              <dd>
                {application.zoho_synced_at ? (
                  <When value={application.zoho_synced_at} />
                ) : (
                  <span className="ws-muted">Not yet synced</span>
                )}
              </dd>
            </dl>
            <p className="ws-note">
              Applications and stage changes are queued for Zoho CRM as they happen. The sync
              worker is not connected yet, so a queued application stays queued rather than
              being lost.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
