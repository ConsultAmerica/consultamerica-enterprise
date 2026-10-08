import type { Metadata } from "next";
import Link from "next/link";

import { deleteDraft } from "@/app/actions/candidate-portal";
import { ConfirmActionButton } from "@/components/candidate/ConfirmActionButton";
import { draftProgress, isDraftEditable } from "@/lib/candidate-portal/drafts";
import { formatDate } from "@/lib/candidate-portal/labels";
import { requireCandidate } from "@/lib/candidate-portal/session";
import { getCandidatePortalStore } from "@/lib/candidate-portal/store";
import { getJobBySlug } from "@/lib/jobs";

export const metadata: Metadata = { title: "Application drafts" };

export default async function CandidateDraftsPage() {
  const session = await requireCandidate("/candidate/drafts");
  const store = getCandidatePortalStore();
  const [drafts, resumes] = await Promise.all([store.listDrafts(session.candidateId), store.listResumes(session.candidateId)]);
  const open = new Map(
    await Promise.all(drafts.map(async (d) => [d.id, Boolean((await getJobBySlug(d.job.slug))?.acceptingApplications)] as const)),
  );
  const resumeName = new Map(resumes.map((r) => [r.documentId, r.fileName]));

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Candidate portal</p>
          <h1>Application drafts</h1>
          <p>Unfinished Detailed Apply applications. Drafts are private to you — recruiters only see submitted applications.</p>
        </div>
      </div>
      <section className="ws-panel">
        {drafts.length === 0 ? (
          <p className="ws-muted">
            You have no drafts. On any job, choose <strong>Detailed Apply</strong> and use <em>Save draft</em> to come back
            later.
          </p>
        ) : (
          <ul className="ws-list">
            {drafts.map((d) => {
              const progress = draftProgress(d);
              const accepting = open.get(d.id);
              const editable = isDraftEditable(d);
              return (
                <li key={d.id} className="cp-draft">
                  <div>
                    <strong>{d.job.title}</strong>
                    <div className="ws-muted">
                      {d.job.company} · Last saved {formatDate(d.updatedAt)} · {progress.done} of {progress.total} sections
                      started
                      {d.resumeDocumentId ? ` · Résumé: ${resumeName.get(d.resumeDocumentId) ?? "selected"}` : ""}
                    </div>
                    {!accepting ? (
                      <p className="cp-msg cp-msg-error">This position is no longer accepting applications.</p>
                    ) : null}
                    {d.status === "SUBMITTING" && !editable ? (
                      <p className="cp-msg">Submission in progress — check My Applications in a moment.</p>
                    ) : null}
                  </div>
                  <div className="cp-draft-actions">
                    {accepting && editable ? (
                      <Link href={`/jobs/${d.job.slug}/apply/detailed`} className="btn btn-primary btn-sm">
                        Continue
                      </Link>
                    ) : null}
                    {d.status === "DRAFT" ? (
                      <ConfirmActionButton
                        run={deleteDraft.bind(null, d.id)}
                        label="Delete draft"
                        pendingLabel="Deleting…"
                        confirmText={`Delete your draft for ${d.job.title}? Your résumé stays in your library.`}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
