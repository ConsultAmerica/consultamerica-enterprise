import Link from "next/link";
import { notFound } from "next/navigation";

import { MatchAnalysis } from "@/components/workspace/MatchAnalysis";
import { ResumeProfileView } from "@/components/workspace/ResumeProfileView";
import { ViewDocumentButton } from "@/components/workspace/ViewDocumentButton";
import { fmtDate } from "@/components/workspace/format";
import { recruitingRepository } from "@/lib/recruiting";
import { getApplicationSnapshot } from "@/lib/recruiting/application-snapshots";
import { analyzeApplication } from "@/lib/recruiting/matching";
import { applicationStatusLabels } from "@/types/recruiting";

type Props = { params: Promise<{ applicationId: string }> };

export default async function ApplicationPage({ params }: Props) {
  const { applicationId } = await params;
  const application = await recruitingRepository.getApplicationById(applicationId);
  if (!application) notFound();
  const [candidate, job, snapshot] = await Promise.all([
    recruitingRepository.getCandidateProfile(application.candidateId),
    recruitingRepository.getJobDetail(application.requisitionId),
    getApplicationSnapshot(applicationId),
  ]);
  const resumeLink = candidate?.applicationDocumentLinks?.find((l) => l.applicationId === applicationId && (l.documentRole ?? l.purpose) === "RESUME");
  const resumeDoc = resumeLink ? candidate?.documents.find((d) => d.id === resumeLink.documentId) : undefined;
  const match = await analyzeApplication({
    candidateId: application.candidateId,
    requisitionId: application.requisitionId,
    resumeDocumentId: resumeLink?.documentId ?? null,
    confirmedSkills: snapshot?.profile.skills,
  });
  const history = (candidate?.statusHistory ?? []).filter((h) => h.applicationId === applicationId);

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">
            <Link href="/app/recruiting/applications">Applications</Link> · {application.applicationNumber}
          </p>
          <h1>
            {candidate ? `${candidate.candidate.firstName} ${candidate.candidate.lastName}` : "Candidate"} — {job?.requisition.title ?? "Job"}
          </h1>
          <p>
            <span className="ws-pill blue">{applicationStatusLabels[application.status] ?? application.status}</span> · applied {fmtDate(application.appliedAt)}
            {snapshot ? " · Detailed Apply" : " · Easy Apply"}
          </p>
        </div>
      </div>

      <div className="ws-grid-wide">
        <div>
          <section className="ws-panel">
            <h2>Potential match for this job</h2>
            {match ? <MatchAnalysis analysis={match.analysis} /> : <p className="ws-muted">The requisition could not be loaded.</p>}
          </section>

          <section className="ws-panel">
            <h2>Parsed resume (submitted with this application)</h2>
            <ResumeProfileView profile={match?.profile ?? null} />
          </section>

          {snapshot ? (
            <section className="ws-panel">
              <h2>Profile reviewed by the candidate</h2>
              <p className="ws-muted">Submitted with this application via Detailed Apply. Candidate-confirmed; it does not overwrite other records.</p>
              {snapshot.profile.skills.length ? (
                <>
                  <h3>Skills</h3>
                  <div className="ws-chips">{snapshot.profile.skills.map((s) => <span key={s} className="ws-chip">{s}</span>)}</div>
                </>
              ) : null}
              {snapshot.profile.experience.length ? (
                <>
                  <h3>Experience</h3>
                  <ul className="ws-list">
                    {snapshot.profile.experience.map((e, i) => (
                      <li key={i}>
                        <strong>{e.title}</strong>
                        {e.company ? ` · ${e.company}` : ""}
                        <div className="ws-muted">{e.startDate || "?"} – {e.isCurrent ? "Present" : e.endDate || "?"}</div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {snapshot.profile.education.length ? (
                <>
                  <h3>Education</h3>
                  <ul className="ws-list">
                    {snapshot.profile.education.map((e, i) => (
                      <li key={i}>
                        {[e.degree, e.fieldOfStudy].filter(Boolean).join(" in ")}
                        {e.institution ? ` · ${e.institution}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {snapshot.profile.certifications.length ? (
                <>
                  <h3>Certifications</h3>
                  <ul className="ws-list">{snapshot.profile.certifications.map((c) => <li key={c}>{c}</li>)}</ul>
                </>
              ) : null}
            </section>
          ) : null}
        </div>

        <div>
          <section className="ws-panel">
            <h2>Submitted resume</h2>
            {resumeDoc ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span>
                  {resumeDoc.fileName}
                  <div className="ws-muted">{fmtDate(resumeLink?.attachedAt ?? resumeDoc.uploadedAt)}</div>
                </span>
                <ViewDocumentButton documentId={resumeDoc.id} />
              </div>
            ) : (
              <p className="ws-muted">No resume is linked to this application.</p>
            )}
          </section>

          <section className="ws-panel">
            <h2>Candidate</h2>
            {candidate ? (
              <dl className="ws-dl">
                <dt>Email</dt>
                <dd>{candidate.candidate.email}</dd>
                <dt>Phone</dt>
                <dd>{candidate.candidate.phone || "—"}</dd>
                <dt>Profile</dt>
                <dd>
                  <Link href={`/app/recruiting/candidates/${application.candidateId}`}>Open candidate</Link>
                </dd>
              </dl>
            ) : null}
            {application.additionalInformation ? (
              <>
                <h3>Additional information</h3>
                <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{application.additionalInformation}</p>
              </>
            ) : null}
          </section>

          <section className="ws-panel">
            <h2>History</h2>
            {history.length ? (
              <ul className="ws-list">
                {history.map((h) => (
                  <li key={h.id}>
                    {h.fromStatus ? `${applicationStatusLabels[h.fromStatus]} → ` : ""}
                    {applicationStatusLabels[h.toStatus]}
                    <div className="ws-muted">{fmtDate(h.createdAt)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ws-muted">No status changes recorded.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
