import type { Metadata } from "next";

import { ResumeEntry, ResumeUploadForm, type LibraryEntry } from "@/components/candidate/ResumeLibrary";
import { effectiveProfile } from "@/lib/candidate-portal/resume-profile";
import { requireCandidate } from "@/lib/candidate-portal/session";
import { getCandidatePortalStore } from "@/lib/candidate-portal/store";

export const metadata: Metadata = { title: "Résumé library" };

export default async function CandidateResumesPage() {
  const session = await requireCandidate("/candidate/resumes");
  const store = getCandidatePortalStore();
  const resumes = await store.listResumes(session.candidateId, { includeArchived: true });
  const entries: LibraryEntry[] = await Promise.all(
    resumes.map(async (resume) => {
      const profile = resume.status === "ACTIVE" ? await store.getResumeProfile(session.candidateId, resume.documentId) : null;
      return { resume, profile, effective: effectiveProfile(profile ?? { parsed: null, reviewed: null }) };
    }),
  );
  const active = entries.filter((e) => e.resume.status === "ACTIVE");
  const previous = entries.filter((e) => e.resume.status === "ARCHIVED");

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Candidate portal</p>
          <h1>Résumé library</h1>
          <p>
            Keep several versions, choose your default, and check what we extracted. Each application keeps the exact file
            you submitted with it, even if you later remove it here.
          </p>
        </div>
      </div>

      <section className="ws-panel" aria-labelledby="lib-upload">
        <h2 id="lib-upload">Add a résumé</h2>
        <ResumeUploadForm hasResumes={active.length > 0} />
      </section>

      <section className="ws-panel" aria-labelledby="lib-list">
        <h2 id="lib-list">My résumés ({active.length})</h2>
        {active.length === 0 ? (
          <p className="ws-muted">No résumés yet. Upload one above to reuse it across applications.</p>
        ) : (
          <ul className="ws-list cp-resumes">
            {active.map((entry) => (
              <ResumeEntry key={entry.resume.documentId} entry={entry} />
            ))}
          </ul>
        )}
      </section>

      {previous.length > 0 ? (
        <section className="ws-panel" aria-labelledby="lib-previous">
          <h2 id="lib-previous">Previous versions</h2>
          <p className="ws-muted">
            Removed from your library but kept because they were submitted with an application. They can&apos;t be used for
            new applications.
          </p>
          <ul className="ws-list cp-resumes">
            {previous.map((entry) => (
              <ResumeEntry key={entry.resume.documentId} entry={entry} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
