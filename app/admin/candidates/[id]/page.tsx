/**
 * One person: how to reach them, and every application they have made.
 *
 * The application history is the reason this page exists. A recruiter taking a
 * call needs "what has this person applied for, and where did each one get to"
 * in one place, which no per-application screen can answer. db/neon/002_fixes.sql
 * added applications_candidate_idx for exactly this lookup.
 *
 * HOW THE HISTORY IS FETCHED, AND WHY IT LOOKS INDIRECT. lib/neon/applications.ts
 * has no "applications for this candidate" reader, and the data layer is out of
 * scope for this change, so the list is obtained by searching the queue for the
 * candidate's email — listApplications matches it with an escaped ILIKE — and
 * then filtering on candidate_id so the result is exact rather than merely
 * email-shaped. The cost is one wide read instead of one indexed read; the
 * right fix is a listApplicationsForCandidate(candidateId) in the data layer,
 * which would use that index directly.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { listApplications } from "@/lib/neon/applications";
import { requireAdmin } from "@/lib/neon/auth";
import { getCandidateById } from "@/lib/neon/candidates";
import { NeonConfigError } from "@/lib/neon/client";
import type { ApplicationStatus } from "@/lib/neon/types";

export const metadata: Metadata = {
  title: "Candidate",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

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

/** See app/admin/applications/page.tsx for why a Date is not simply assumed. */
function asDate(value: Date | string | null | undefined): Date | null {
  const date = value instanceof Date ? value : typeof value === "string" && value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function fmtDate(value: Date | string | null): string {
  const date = asDate(value);
  return date ? DATE.format(date) : "—";
}

function When({ value }: { value: Date | string | null }) {
  const date = asDate(value);
  if (!date) return <span className="ws-muted">—</span>;
  return <time dateTime={date.toISOString()}>{DATE_TIME.format(date)}</time>;
}

/**
 * Upper bound on the email prefilter. A single person's application count is
 * nowhere near this; the cap exists because listApplications is a queue reader
 * and an unbounded read of it is not something a profile page should do.
 */
const PREFILTER_LIMIT = 200;

/** See app/admin/applications/page.tsx for why the tone map is duplicated. */
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

const stageLabel = (status: string) => status.charAt(0) + status.slice(1).toLowerCase();

/** See app/admin/applications/[id]/page.tsx for the reasoning on all three. */
const MAILTO_SAFE = /^[^\s<>"'`()[\],;:\\?&%]+@[^\s<>"'`()[\],;:\\?&%]+\.[^\s<>"'`()[\],;:\\?&%]+$/;

function mailtoHref(email: string): string | null {
  const value = email.trim();
  return MAILTO_SAFE.test(value) ? `mailto:${value}` : null;
}

function telHref(phone: string): string | null {
  const normalized = phone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return normalized.replace(/\D/g, "").length >= 7 ? `tel:${normalized}` : null;
}

function httpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function zohoContactUrl(zohoContactId: string): string | null {
  return /^\d{6,30}$/.test(zohoContactId)
    ? `https://crm.zoho.com/crm/tab/Contacts/${zohoContactId}`
    : null;
}

export default async function AdminCandidateDetailPage({ params }: Props) {
  const { id } = await params;

  type Loaded = { candidate: Awaited<ReturnType<typeof getCandidateById>>; applications: Awaited<ReturnType<typeof listApplications>> };

  let loaded: Loaded | null = null;
  try {
    await requireAdmin({ returnTo: `/admin/candidates/${id}` });
    // getCandidateById screens a malformed id and returns null, so the
    // applications read is only worth doing once the person is known to exist.
    const candidate = await getCandidateById(id);
    const applications = candidate
      ? (await listApplications({ q: candidate.email, limit: PREFILTER_LIMIT })).filter(
          (row) => row.candidate_id === candidate.id,
        )
      : [];
    loaded = { candidate, applications };
  } catch (error) {
    if (!(error instanceof NeonConfigError)) throw error;
    return (
      <main className="ws-main">
        <div className="ws-head">
          <div>
            <p className="ws-eyebrow">Recruitment</p>
            <h1>Candidate</h1>
          </div>
        </div>
        <section className="ws-panel">
          <div className="ws-empty">
            <h2>The recruitment database is not configured</h2>
            <p>
              No Neon connection string is set on this deployment, so this record cannot be read.
              Set <strong>DATABASE_URL</strong> (or <strong>POSTGRES_URL</strong>) to the Neon
              pooled connection string and reload. Locally, copy it into{" "}
              <strong>.env.local</strong>.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const candidate = loaded.candidate;
  if (!candidate) notFound();
  const applications = loaded.applications;

  const name = `${candidate.first_name} ${candidate.last_name}`.trim() || candidate.email;
  const email = mailtoHref(candidate.email);
  const phone = candidate.phone ? telHref(candidate.phone) : null;
  const linkedin = httpUrl(candidate.linkedin_url);
  const portfolio = httpUrl(candidate.portfolio_url);
  const zoho = candidate.zoho_contact_id ? zohoContactUrl(candidate.zoho_contact_id) : null;

  return (
    <main className="ws-main">
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">
            <Link href="/admin/candidates">Candidates</Link> / Record
          </p>
          <h1>{name}</h1>
          <p>
            {applications.length === 0
              ? "No applications on this record yet."
              : `${applications.length} application${applications.length === 1 ? "" : "s"} on this record.`}
          </p>
        </div>
        <nav className="ca-crm-nav" aria-label="Recruitment sections">
          <Link className="ws-btn" href="/admin/candidates">
            Back to candidates
          </Link>
        </nav>
      </div>

      <div className="ws-grid-wide">
        <div>
          <section className="ws-panel">
            <h2>Applications</h2>
            {applications.length === 0 ? (
              <div className="ws-empty">
                <h2>Nothing applied for yet</h2>
                <p>
                  This record exists, but no application is attached to it. That happens when a
                  candidate record was created and the application it belonged to was later
                  removed. Applications normally arrive with the record.
                </p>
                <Link className="ws-btn" href="/admin/applications">
                  Open the application queue
                </Link>
              </div>
            ) : (
              <div className="ws-table-wrap">
                <table className="ws-table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Reference</th>
                      <th>Stage</th>
                      <th>Applied</th>
                      <th>Assigned recruiter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link href={`/admin/applications/${row.id}`}>{row.job_title}</Link>
                          <div className="ws-muted">{row.job_reference}</div>
                        </td>
                        <td className="ws-muted">{row.reference}</td>
                        <td>
                          <span className={`ws-pill ${stageTone(row.status)}`.trim()}>
                            {stageLabel(row.status)}
                          </span>
                        </td>
                        <td className="ws-muted">{fmtDate(row.applied_at)}</td>
                        <td>
                          {row.assigned_recruiter_name ?? (
                            <span className="ws-muted">Unassigned</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div>
          <section className="ws-panel">
            <h2>Contact</h2>
            <dl className="ws-dl">
              <dt>Email</dt>
              <dd>{email ? <a href={email}>{candidate.email}</a> : candidate.email}</dd>
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
              <dt>Added</dt>
              <dd>
                <When value={candidate.created_at} />
              </dd>
              {/* Only when the CRM id exists: the Zoho integration is not
                  connected yet, so anything else would be a dead link. */}
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
            <p className="ws-note">
              Contact details are updated by the candidate&rsquo;s own submissions. A later
              application can fill a blank field but never blanks one that is already recorded.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
