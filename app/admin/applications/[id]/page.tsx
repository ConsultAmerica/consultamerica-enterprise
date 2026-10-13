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

import { AiInterviewPanel } from "@/components/admin/AiInterviewPanel";
import {
  ApplicationRecruiterSelect,
  ApplicationStageControl,
} from "@/components/admin/ApplicationStageControl";
import { NeonRecordPanel } from "@/components/admin/NeonConsoleLink";
import { ResumeLink } from "@/components/admin/ResumeLink";
import { ResumePreview } from "@/components/admin/ResumePreview";
import { parseConsultHireReport } from "@/lib/consulthire/report";
import { secondRoundEligibility, SECOND_ROUND_THRESHOLD } from "@/lib/consulthire/second-round";
import { locationLabels } from "@/lib/jobs/public-model";
import { listAdminUsers } from "@/lib/neon/admin-users";
import { getApplicationDetail } from "@/lib/neon/applications";
import { type AdminRole, requireAdmin } from "@/lib/neon/auth";
import { NeonConfigError } from "@/lib/neon/client";
import type { ActivityKind, ApplicationStatus, InterviewRow } from "@/lib/neon/types";

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
 * Why the second-round button is not there, said in a sentence.
 *
 * The four reasons are four different situations and only one of them is
 * "this candidate was not good enough". Rendering nothing for all four would
 * leave a recruiter wondering whether the feature is broken on the very screen
 * where they are deciding about a person.
 *
 * Mirrors the copy in sendSecondRoundAction deliberately: the page explains why
 * the button is absent and the action explains why a click was refused, and a
 * recruiter should not be told two different stories about one rule.
 */
function secondRoundBlockedReason(interview: InterviewRow | null): string | null {
  const eligibility = secondRoundEligibility(interview);
  if (eligibility.eligible) return null;
  switch (eligibility.reason) {
    case "no-interview":
      return null;
    case "not-scored":
      return (
        "The second-round invitation becomes available once the candidate finishes the " +
        "interview and the result arrives."
      );
    case "below-threshold":
      return (
        `Scored ${eligibility.score}, below the ${SECOND_ROUND_THRESHOLD} needed for an ` +
        "automatic second-round invitation. Contact the candidate directly if you want to take " +
        "them further."
      );
    case "already-sent":
      // Handled by the sent stamp in the panel, which says more than this would.
      return null;
  }
}

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
 * Only http(s) URLs become links. linkedin_url and portfolio_url are typed by
 * the candidate, and a `javascript:` or `data:` href in a recruiter's browser is
 * a stored XSS.
 *
 * resume_url deliberately does NOT go through here any more. It is a private
 * blob URL, so it was never clickable regardless of protocol — see ResumeLink.
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
  // The role, for the Neon DB hatch at the foot of the page, which is for
  // OWNER and ADMIN only.
  let role: AdminRole | null = null;
  try {
    const user = await requireAdmin({ returnTo: `/admin/applications/${id}` });
    role = user.role;
    loaded = await load();
  } catch (error) {
    if (!(error instanceof NeonConfigError)) throw error;
    return (
      <main className="ws-main">
        <div className="ws-head">
          <div>
            <p className="ws-eyebrow">Consult America / Recruitment</p>
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
  // `interviews` is deliberately not destructured here. It is split below into
  // the AI screen, which gets its own panel, and everything else, which keeps
  // the sidebar list; binding the whole array as well would leave a name in
  // scope that must never be rendered directly or the AI interview appears
  // twice on one page.
  const { application, candidate, job, activities } = loaded.detail;

  const name = `${candidate.first_name} ${candidate.last_name}`.trim() || candidate.email;
  const email = mailtoHref(candidate.email);
  const phone = candidate.phone ? telHref(candidate.phone) : null;
  const linkedin = httpUrl(candidate.linkedin_url);
  const portfolio = httpUrl(candidate.portfolio_url);
  const zoho = candidate.zoho_contact_id ? zohoContactUrl(candidate.zoho_contact_id) : null;

  const recruiters = loaded.admins.map((admin) => ({
    id: admin.id,
    name: admin.fullName,
    isActive: admin.isActive,
  }));

  /*
    The AI interview, picked out of the interviews list rather than fetched
    again. getApplicationDetail already read every interview for this
    application, and interviews_application_ai_uidx guarantees there is at most
    one AI_SCREEN among them, so this is a find and not a query.
  */
  const aiInterview = loaded.detail.interviews.find((row) => row.kind === "AI_SCREEN") ?? null;
  const aiEligibility = secondRoundEligibility(aiInterview);
  const aiReport = aiInterview ? parseConsultHireReport(aiInterview.report) : null;
  /*
    The remaining interviews, for the panel further down. Without this
    exclusion the AI screen would appear twice on one screen: once as a full
    report and once as a one-line row in the generic list, with the second copy
    saying much less than the first.
  */
  const otherInterviews = loaded.detail.interviews.filter((row) => row.kind !== "AI_SCREEN");

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
                  {/* Location and arrangement are deduplicated: a remote role
                      reads "Remote (US)" once, not "Remote (US) · Remote".
                      See showWorkplaceType in lib/jobs/public-model.ts. */}
                  {[
                    job.department,
                    ...locationLabels(job.location, humanize(job.workplace_type)),
                  ]
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
              <dt>Applied via</dt>
              <dd>
                {/* Named here as well as in the queue, because this is the
                    screen somebody opens from an email and the two routes
                    produce different things to act on. */}
                <span
                  className={`ws-pill${application.method === "AI_INTERVIEW" ? " blue" : ""}`}
                >
                  {application.method === "AI_INTERVIEW" ? "AI interview" : "Easy Apply form"}
                </span>
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
                {/* The document itself is previewed in its own panel below.
                    This row stays because the facts list is what someone scans
                    for "is there one, and what is it called".

                    Never hrefs the stored blob URL: the blob is private and a
                    direct link always returned 403. It goes through the
                    session-checked signing route. See ResumeLink.tsx. */}
                <ResumeLink
                  applicationId={application.id}
                  resumeUrl={application.resume_url}
                  filename={application.resume_filename}
                  sizeBytes={application.resume_size_bytes}
                />
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

          {/*
            The AI interview result, in the main column and above the résumé.

            ABOVE, not in the sidebar next to the other interviews, and that is
            a judgement about what this page is for. For a candidate who came
            through the AI route the interview IS the application: it is a
            scored, structured, job-specific conversation, and it is the thing a
            recruiter reads to decide. The résumé is supporting material for
            them, which is the reverse of the Easy Apply case. Rendered only
            when an AI interview exists, so nothing changes for form applicants.
          */}
          {aiInterview ? (
            <section className="ws-panel">
              <h2>AI interview</h2>
              <AiInterviewPanel
                applicationId={application.id}
                // NUMERIC arrives as a string and is passed through as stored;
                // parsing it to re-print it could only lose precision.
                score={aiInterview.score}
                verdict={aiInterview.verdict}
                statusLabel={humanize(aiInterview.status)}
                // Every date is formatted here, on the server, in the one fixed
                // locale, so the client component cannot produce a hydration
                // mismatch from a different timezone.
                launchedLabel={
                  aiInterview.launched_at ? fmtDateTime(aiInterview.launched_at) : null
                }
                completedLabel={
                  aiInterview.completed_at ? fmtDateTime(aiInterview.completed_at) : null
                }
                secondRoundSentLabel={
                  aiInterview.second_round_sent_at
                    ? fmtDateTime(aiInterview.second_round_sent_at)
                    : null
                }
                report={aiReport}
                canSendSecondRound={aiEligibility.eligible}
                blockedReason={secondRoundBlockedReason(aiInterview)}
              />
              <p className="ws-note">
                Scored by ConsultHire against this job description. A score of{" "}
                {SECOND_ROUND_THRESHOLD} or above unlocks the second-round invitation. The score is
                a screening signal, not a decision: nothing here rejects anybody automatically.
              </p>
            </section>
          ) : null}

          {/*
            The résumé, in the workspace rather than behind a link. Placed
            immediately under the application facts and above the notes,
            because the order someone works in is: what did they apply for,
            what does the CV say, what do I think.
          */}
          <section className="ws-panel">
            <h2>Résumé</h2>
            <ResumePreview
              applicationId={application.id}
              resumeUrl={application.resume_url}
              filename={application.resume_filename}
              sizeBytes={application.resume_size_bytes}
            />
          </section>

          {/* REMOVED: the Notes panel. application_notes was dropped in
              db/neon/005_cleanup.sql. Nobody had written a note in either
              database and the timeline below already records what happened to
              an application and who did it, which is what the panel was really
              being read for. */}

          <section className="ws-panel">
            <h2>Activity</h2>
            {/* Read-only by design. application_activities is append-only: it is
                the audit trail, so this screen offers no way to edit or remove
                an entry and must never grow one. Deleting the whole application
                is the one thing that removes entries, and it removes all of
                them at once rather than letting anyone edit the record of what
                happened. */}
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
          </section>

          <section className="ws-panel">
            <h2>Interviews</h2>
            {otherInterviews.length === 0 ? (
              <p className="ws-muted">
                {aiInterview
                  ? "No interviews beyond the AI screen above are recorded against this application."
                  : "No interviews are recorded against this application."}
              </p>
            ) : (
              <ul className="ws-list">
                {otherInterviews.map((interview) => (
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
            {/* The note used to say nothing wrote AI results yet. It does now:
                the completion webhook at app/api/webhooks/consulthire fills
                them in, and they render in their own panel in the main column
                rather than as a line here, because for an AI applicant the
                interview is the application rather than a footnote to it. */}
          </section>

          {/* REMOVED: the CRM sync panel. Zoho syncing is off (see
              ZOHO_SYNC_ENABLED in lib/neon/crm.ts), so zoho_synced_at can
              never advance again and this panel would read "Not yet synced"
              on every application forever. The column itself is kept: it is
              the record of what did reach Zoho while the integration ran. */}

          {/*
            Last panel in the sidebar, under CRM sync. The sidebar is where this
            page keeps facts about the record rather than about the person, and
            it is read occasionally rather than worked, which is exactly what
            this is. The id it shows is applications.id and not the human
            reference: the reference is for talking to people, the uuid is what
            a WHERE clause matches. Renders nothing for a RECRUITER.
          */}
          {role ? (
            <NeonRecordPanel
              role={role}
              table="applications"
              id={application.id}
              resume={{
                url: application.resume_url,
                filename: application.resume_filename,
                sizeBytes: application.resume_size_bytes,
              }}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
