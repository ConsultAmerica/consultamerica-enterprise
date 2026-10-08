import type { Metadata } from "next";
import Link from "next/link";

import { candidateStatus, formatDate } from "@/lib/candidate-portal/labels";
import { requireCandidate } from "@/lib/candidate-portal/session";
import { getCandidatePortalStore } from "@/lib/candidate-portal/store";

export const metadata: Metadata = { title: "My applications" };

export default async function CandidateApplicationsPage() {
  const session = await requireCandidate("/candidate/applications");
  const applications = await getCandidatePortalStore().listApplications(session.candidateId);

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Candidate portal</p>
          <h1>My applications</h1>
          <p>Every application you&apos;ve submitted, with the exact résumé you sent.</p>
        </div>
      </div>
      <section className="ws-panel">
        {applications.length === 0 ? (
          <p className="ws-muted">
            No submitted applications yet. <Link href="/jobs">Search open jobs</Link> to find your next role.
          </p>
        ) : (
          <div className="ws-table-wrap">
            <table className="ws-table cp-table">
              <thead>
                <tr>
                  <th scope="col">Position</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Applied</th>
                  <th scope="col">Résumé submitted</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => {
                  const status = candidateStatus(a.status);
                  return (
                    <tr key={a.applicationId}>
                      <td data-label="Position">
                        <span className="cp-cell">
                          {a.job.slug ? <Link href={`/jobs/${a.job.slug}`}>{a.job.title}</Link> : <strong>{a.job.title}</strong>}
                          {a.job.company ? <span className="ws-muted">{a.job.company}</span> : null}
                        </span>
                      </td>
                      <td data-label="Reference">{a.applicationNumber}</td>
                      <td data-label="Applied">{formatDate(a.appliedAt)}</td>
                      <td data-label="Résumé">
                        {a.resume ? (
                          <a href={`/candidate/resumes/${encodeURIComponent(a.resume.documentId)}/file`} target="_blank" rel="noopener">
                            {a.resume.fileName}
                          </a>
                        ) : (
                          <span className="ws-muted">—</span>
                        )}
                      </td>
                      <td data-label="Status">
                        <span className={`ws-pill ${status.tone}`}>{status.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="ws-note">
          Statuses are updated by the recruiting team. If your role has moved forward, a recruiter will contact you
          directly.
        </p>
      </section>
    </>
  );
}
