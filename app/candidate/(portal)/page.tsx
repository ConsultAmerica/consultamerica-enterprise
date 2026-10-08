import type { Metadata } from "next";
import Link from "next/link";

import { candidateStatus, formatDate } from "@/lib/candidate-portal/labels";
import { requireCandidate } from "@/lib/candidate-portal/session";
import { getCandidatePortalStore } from "@/lib/candidate-portal/store";

export const metadata: Metadata = { title: "Dashboard" };

export default async function CandidateDashboardPage() {
  const session = await requireCandidate();
  const store = getCandidatePortalStore();
  const [applications, drafts, resumes, saved] = await Promise.all([
    store.listApplications(session.candidateId),
    store.listDrafts(session.candidateId),
    store.listResumes(session.candidateId),
    store.listSavedJobs(session.candidateId),
  ]);
  const defaultResume = resumes.find((r) => r.isDefault) ?? resumes[0] ?? null;

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Candidate portal</p>
          <h1>Welcome back, {session.displayName.split(" ")[0] || "there"}</h1>
          <p>Your applications, résumés and unfinished drafts in one place.</p>
        </div>
        <Link href="/jobs" className="btn btn-primary btn-sm">
          Search Open Jobs
        </Link>
      </div>

      <div className="ws-stats cp-stats">
        <Link href="/candidate/applications" className="ws-stat">
          <strong>{applications.length}</strong>
          <span>My applications</span>
        </Link>
        <Link href="/candidate/drafts" className="ws-stat">
          <strong>{drafts.length}</strong>
          <span>Application drafts</span>
        </Link>
        <Link href="/candidate/resumes" className="ws-stat">
          <strong>{resumes.length}</strong>
          <span>My résumés</span>
        </Link>
        <Link href="/candidate/saved-jobs" className="ws-stat">
          <strong>{saved.length}</strong>
          <span>Saved jobs</span>
        </Link>
      </div>

      <div className="ws-grid">
        <section className="ws-panel" aria-labelledby="dash-apps">
          <h2 id="dash-apps">My applications</h2>
          {applications.length === 0 ? (
            <p className="ws-muted">You haven&apos;t submitted an application yet.</p>
          ) : (
            <ul className="ws-list">
              {applications.slice(0, 4).map((a) => {
                const status = candidateStatus(a.status);
                return (
                  <li key={a.applicationId} className="cp-row">
                    <span>
                      <strong>{a.job.title}</strong>
                      <span className="ws-muted"> · Applied {formatDate(a.appliedAt)}</span>
                    </span>
                    <span className={`ws-pill ${status.tone}`}>{status.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="cp-more">
            <Link href="/candidate/applications">View all applications →</Link>
          </p>
        </section>

        <section className="ws-panel" aria-labelledby="dash-drafts">
          <h2 id="dash-drafts">Application drafts</h2>
          {drafts.length === 0 ? (
            <p className="ws-muted">
              No unfinished applications. Start a Detailed Apply and use <em>Save draft</em> to finish later.
            </p>
          ) : (
            <ul className="ws-list">
              {drafts.slice(0, 4).map((d) => (
                <li key={d.id} className="cp-row">
                  <span>
                    <strong>{d.job.title}</strong>
                    <span className="ws-muted"> · Saved {formatDate(d.updatedAt)}</span>
                  </span>
                  <Link href={`/jobs/${d.job.slug}/apply/detailed`}>Continue</Link>
                </li>
              ))}
            </ul>
          )}
          <p className="cp-more">
            <Link href="/candidate/drafts">Manage drafts →</Link>
          </p>
        </section>

        <section className="ws-panel" aria-labelledby="dash-resumes">
          <h2 id="dash-resumes">My résumés</h2>
          {defaultResume ? (
            <p>
              Default: <strong>{defaultResume.fileName}</strong>
              <span className="ws-muted"> · uploaded {formatDate(defaultResume.uploadedAt)}</span>
            </p>
          ) : (
            <p className="ws-muted">Upload a résumé once and reuse it for every Detailed Apply.</p>
          )}
          <p className="cp-more">
            <Link href="/candidate/resumes">Open résumé library →</Link>
          </p>
        </section>

        <section className="ws-panel" aria-labelledby="dash-reco">
          <h2 id="dash-reco">Recommended jobs</h2>
          <p className="ws-muted">
            Coming soon: openings matched to your résumé, with a clear explanation of which requirements your résumé
            shows. Recommendations will be guidance only — they never affect how your applications are reviewed.
          </p>
          <p className="cp-more">
            <Link href="/candidate/saved-jobs">Saved jobs ({saved.length}) →</Link>
          </p>
        </section>
      </div>
    </>
  );
}
