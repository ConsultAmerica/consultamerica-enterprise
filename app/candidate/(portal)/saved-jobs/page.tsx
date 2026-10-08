import type { Metadata } from "next";
import Link from "next/link";

import { setJobSaved } from "@/app/actions/candidate-portal";
import { ConfirmActionButton } from "@/components/candidate/ConfirmActionButton";
import { formatDate } from "@/lib/candidate-portal/labels";
import { requireCandidate } from "@/lib/candidate-portal/session";
import { getCandidatePortalStore } from "@/lib/candidate-portal/store";

export const metadata: Metadata = { title: "Saved jobs" };

export default async function CandidateSavedJobsPage() {
  const session = await requireCandidate("/candidate/saved-jobs");
  const saved = await getCandidatePortalStore().listSavedJobs(session.candidateId);

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Candidate portal</p>
          <h1>Saved jobs</h1>
          <p>Openings you bookmarked. Save a job from its page with the ☆ Save job button.</p>
        </div>
        <Link href="/jobs" className="btn btn-primary btn-sm">
          Search Open Jobs
        </Link>
      </div>
      <section className="ws-panel">
        {saved.length === 0 ? (
          <p className="ws-muted">No saved jobs yet.</p>
        ) : (
          <ul className="ws-list">
            {saved.map((s) => (
              <li key={s.requisitionId} className="cp-draft">
                <div>
                  {s.job ? (
                    <>
                      <Link href={`/jobs/${s.job.slug}`}>
                        <strong>{s.job.title}</strong>
                      </Link>
                      <div className="ws-muted">
                        {[s.job.company, s.job.location].filter(Boolean).join(" · ")} · Saved {formatDate(s.savedAt)}
                      </div>
                      {!s.job.acceptingApplications ? (
                        <p className="cp-msg cp-msg-error">No longer accepting applications.</p>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <strong>Position no longer listed</strong>
                      <div className="ws-muted">Saved {formatDate(s.savedAt)}</div>
                    </>
                  )}
                </div>
                <div className="cp-draft-actions">
                  {s.job?.acceptingApplications ? (
                    <Link href={`/jobs/${s.job.slug}`} className="btn btn-primary btn-sm">
                      View &amp; apply
                    </Link>
                  ) : null}
                  <ConfirmActionButton run={setJobSaved.bind(null, s.requisitionId, false)} label="Remove" pendingLabel="Removing…" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
