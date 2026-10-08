import Link from "next/link";
import { notFound } from "next/navigation";

import { MatchAnalysis, MatchScore } from "@/components/workspace/MatchAnalysis";
import { ResumeProfileView } from "@/components/workspace/ResumeProfileView";
import { ViewDocumentButton } from "@/components/workspace/ViewDocumentButton";
import { fmtDate } from "@/components/workspace/format";
import { recruitingRepository } from "@/lib/recruiting";
import { findJobsForCandidate } from "@/lib/recruiting/matching";
import { applicationStatusLabels } from "@/types/recruiting";

type Props = { params: Promise<{ candidateId: string }> };

export default async function CandidatePage({ params }: Props) {
  const { candidateId } = await params;
  const detail = await recruitingRepository.getCandidateProfile(candidateId);
  if (!detail) notFound();
  const c = detail.candidate;
  const { profile, matches } = await findJobsForCandidate(candidateId, 8);
  const resumes = detail.documents.filter((d) => d.documentType === "RESUME");

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">
            <Link href="/app/recruiting/candidates">Candidates</Link>
          </p>
          <h1>
            {c.firstName} {c.lastName}
          </h1>
          <p>{profile?.structured?.titles[0] ?? c.professionalSummary?.slice(0, 120) ?? c.source ?? ""}</p>
        </div>
      </div>

      <div className="ws-grid-wide">
        <div>
          <section className="ws-panel">
            <h2>Candidate</h2>
            <dl className="ws-dl">
              <dt>Email</dt>
              <dd>{c.email}</dd>
              <dt>Phone</dt>
              <dd>{c.phone || "—"}</dd>
              <dt>Location</dt>
              <dd>{[c.city, c.state].filter(Boolean).join(", ") || "—"}</dd>
              <dt>LinkedIn</dt>
              <dd>{c.linkedinUrl ? <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer">{c.linkedinUrl}</a> : "—"}</dd>
              <dt>Source</dt>
              <dd>{c.source || "—"}</dd>
            </dl>
          </section>

          <section className="ws-panel">
            <h2>Applications</h2>
            {detail.applications.length ? (
              <ul className="ws-list">
                {detail.applications.map((a) => (
                  <li key={a.applicationId}>
                    <Link href={`/app/recruiting/applications/${a.applicationId}`} style={{ fontWeight: 600 }}>
                      {a.requisitionTitle}
                    </Link>{" "}
                    <span className="ws-pill">{applicationStatusLabels[a.status] ?? a.status}</span>
                    <div className="ws-muted">
                      {a.applicationNumber} · applied {fmtDate(a.appliedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ws-muted">No applications.</p>
            )}
          </section>

          <section className="ws-panel">
            <h2>Resume profile</h2>
            <ResumeProfileView profile={profile} />
          </section>
        </div>

        <div>
          <section className="ws-panel">
            <h2>Documents</h2>
            {resumes.length ? (
              <ul className="ws-list">
                {resumes.map((d) => (
                  <li key={d.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span>
                        {d.fileName}
                        <div className="ws-muted">
                          {fmtDate(d.uploadedAt)}
                          {d.isPrimaryResume ? " · current resume" : ""}
                        </div>
                      </span>
                      <ViewDocumentButton documentId={d.id} label="View" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ws-muted">No resumes on file.</p>
            )}
          </section>

          <section className="ws-panel">
            <h2>Potential job matches</h2>
            <p className="ws-muted" style={{ marginBottom: 8 }}>Compared with current public openings (same eligibility as /jobs).</p>
            {matches.length ? (
              <ul className="ws-list">
                {matches.map((m) => (
                  <li key={m.slug}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <Link href={`/app/recruiting/jobs/${m.requisitionId}`} style={{ fontWeight: 600 }}>{m.title}</Link>
                      <MatchScore analysis={m.analysis} />
                    </div>
                    <details style={{ marginTop: 6 }}>
                      <summary className="ws-muted" style={{ cursor: "pointer" }}>Why</summary>
                      <div style={{ marginTop: 8 }}>
                        <MatchAnalysis analysis={m.analysis} compact />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ws-muted">{profile?.status === "PARSED" ? "No current openings with comparable requirements." : "Available once a resume has been parsed."}</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
