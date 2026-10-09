/**
 * The people, as opposed to the applications.
 *
 * This file used to be a 308 redirect to /app/recruiting/candidates, the
 * Supabase-backed list. That system is untouched; this is the equivalent screen
 * for the Neon recruitment schema, where a candidate is one row deduplicated on
 * email and can hold many applications.
 *
 * Why a separate screen from the application queue: the queue answers "what is
 * in the pipeline", this answers "who is this person and what have they applied
 * for" — the question that comes up when somebody calls back three weeks later
 * about a role nobody can remember.
 *
 * The search term lives in the URL, so the filtered list is shareable and needs
 * no client JavaScript.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/neon/auth";
import { listCandidates } from "@/lib/neon/candidates";
import { NeonConfigError } from "@/lib/neon/client";

export const metadata: Metadata = {
  title: "Candidates",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
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

/** How many rows one page of this list shows. */
const PAGE_SIZE = 100;

/** See app/admin/applications/[id]/page.tsx for why these are validated. */
const MAILTO_SAFE = /^[^\s<>"'`()[\],;:\\?&%]+@[^\s<>"'`()[\],;:\\?&%]+\.[^\s<>"'`()[\],;:\\?&%]+$/;

function mailtoHref(email: string): string | null {
  const value = email.trim();
  return MAILTO_SAFE.test(value) ? `mailto:${value}` : null;
}

function telHref(phone: string): string | null {
  const normalized = phone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  return normalized.replace(/\D/g, "").length >= 7 ? `tel:${normalized}` : null;
}

export default async function AdminCandidatesPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = (one(params.q) ?? "").slice(0, 200).trim();

  let rows: Awaited<ReturnType<typeof listCandidates>> | null = null;
  let notConfigured = false;
  try {
    await requireAdmin({ returnTo: "/admin/candidates" });
    rows = await listCandidates({ q: q || undefined, limit: PAGE_SIZE });
  } catch (error) {
    // Only "no connection string" is handled; a redirect or a real outage keeps
    // its own behaviour.
    if (!(error instanceof NeonConfigError)) throw error;
    notConfigured = true;
  }

  // A const, so the narrowing holds inside the JSX callbacks below.
  const candidates = rows;

  return (
    <main className="ws-main">
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Recruitment</p>
          <h1>Candidates</h1>
          <p>
            One record per person, keyed on their email address, so a second application does
            not create a second candidate. Open a record to see everything they have applied
            for.
          </p>
        </div>
        {/* No section links here: app/admin/layout.tsx draws the admin nav. */}
      </div>

      {notConfigured ? (
        <section className="ws-panel">
          <div className="ws-empty">
            <h2>The recruitment database is not configured</h2>
            <p>
              No Neon connection string is set on this deployment, so candidate records cannot be
              read. Set <strong>DATABASE_URL</strong> (or <strong>POSTGRES_URL</strong>) to the
              Neon pooled connection string and reload. Locally, copy it into{" "}
              <strong>.env.local</strong>.
            </p>
          </div>
        </section>
      ) : !candidates ? null : (
        <section className="ws-panel">
          <form className="ws-toolbar" method="get" role="search">
            <div className="ws-toolbar-field">
              <label htmlFor="cand-q">Search</label>
              <input
                id="cand-q"
                name="q"
                type="search"
                autoComplete="off"
                defaultValue={q}
                placeholder="Name, email or location"
              />
            </div>
            <div className="ca-crm-toolbar-actions">
              <button type="submit" className="ws-btn primary">
                Search
              </button>
              {q ? (
                <Link className="ws-btn" href="/admin/candidates">
                  Clear
                </Link>
              ) : null}
            </div>
            <p className="ws-toolbar-count" aria-live="polite">
              {candidates.length} {candidates.length === 1 ? "record" : "records"}
            </p>
          </form>

          {candidates.length === 0 ? (
            q ? (
              <div className="ws-empty">
                <h2>Nobody matches that search</h2>
                <p>
                  The search covers name, email address and location. Try a shorter term, or part
                  of the email address.
                </p>
                <Link className="ws-btn" href="/admin/candidates">
                  Clear search
                </Link>
              </div>
            ) : (
              <div className="ws-empty">
                <h2>No candidates yet</h2>
                <p>
                  A candidate record is created automatically the first time somebody applies to
                  a published role on the careers site — there is no manual entry and nothing is
                  imported from Zoho. Publish a role and the first applicant will appear here.
                </p>
                <Link className="ws-btn primary" href="/admin/jobs">
                  Publish a role
                </Link>
              </div>
            )
          ) : (
            <>
              <div className="ws-table-wrap">
                <table className="ws-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Phone</th>
                      <th>Location</th>
                      <th>Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((candidate) => {
                      // first_name and last_name are NOT NULL but may be '' —
                      // the sparse re-application upsert relies on it — so fall
                      // back to the email rather than rendering a blank link.
                      const name =
                        `${candidate.first_name} ${candidate.last_name}`.trim() ||
                        candidate.email;
                      const email = mailtoHref(candidate.email);
                      const phone = candidate.phone ? telHref(candidate.phone) : null;
                      return (
                        <tr key={candidate.id}>
                          <td>
                            <Link href={`/admin/candidates/${candidate.id}`}>{name}</Link>
                            <div className="ws-muted">
                              {email ? (
                                <a href={email}>{candidate.email}</a>
                              ) : (
                                candidate.email
                              )}
                            </div>
                          </td>
                          <td>
                            {candidate.phone ? (
                              phone ? (
                                <a href={phone}>{candidate.phone}</a>
                              ) : (
                                candidate.phone
                              )
                            ) : (
                              <span className="ws-muted">Not given</span>
                            )}
                          </td>
                          <td>
                            {candidate.location || <span className="ws-muted">Not given</span>}
                          </td>
                          <td className="ws-muted">{fmtDate(candidate.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {candidates.length === PAGE_SIZE ? (
                <p className="ws-table-caption">
                  Showing the {PAGE_SIZE} most recently added records. Search to reach older
                  ones.
                </p>
              ) : null}
            </>
          )}
        </section>
      )}
    </main>
  );
}
