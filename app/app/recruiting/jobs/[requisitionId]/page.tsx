import Link from "next/link";
import { notFound } from "next/navigation";

import { JobDescriptionEditor } from "@/components/workspace/JobDescriptionEditor";
import { MatchAnalysis, MatchScore } from "@/components/workspace/MatchAnalysis";
import { fmtDate, humanize, oneParam } from "@/components/workspace/format";
import { assessJobCompleteness } from "@/lib/jobs/completeness";
import { recruitingRepository } from "@/lib/recruiting";
import { findCandidatesForRequisition } from "@/lib/recruiting/matching";
import { applicationStatusLabels } from "@/types/recruiting";

type Props = {
  params: Promise<{ requisitionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RequisitionPage({ params, searchParams }: Props) {
  const { requisitionId } = await params;
  const tab = oneParam((await searchParams).tab) ?? "overview";
  const [detail, posting] = await Promise.all([
    recruitingRepository.getJobDetail(requisitionId),
    recruitingRepository.getPostingForRequisition(requisitionId),
  ]);
  if (!detail) notFound();
  const r = detail.requisition;
  const readiness = assessJobCompleteness({
    summary: posting ? posting.summary : undefined,
    description: posting?.description ?? r.description,
    responsibilities: posting?.responsibilities ?? r.responsibilities,
    qualifications: posting?.qualifications ?? r.qualifications,
    preferredQualifications: posting?.preferredQualifications ?? r.preferredQualifications,
    locationName: posting?.locationName ?? detail.locationName,
  });
  const base = `/app/recruiting/jobs/${requisitionId}`;

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">
            <Link href="/app/recruiting/jobs">Jobs</Link> · {r.requisitionNumber}
          </p>
          <h1>{r.title}</h1>
          <p>
            {detail.departmentName} · {detail.locationName} ·{" "}
            <span className={`ws-pill ${r.status === "DRAFT" ? "amber" : r.status === "PUBLISHED" ? "blue" : ""}`}>{humanize(r.status)}</span>
            {detail.postingSlug ? (
              <>
                {" "}
                · <Link href={`/jobs/${detail.postingSlug}`}>Public posting</Link>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <nav className="ws-tabs" aria-label="Requisition sections">
        <Link href={base} aria-current={tab === "overview" ? "page" : undefined}>Overview</Link>
        <Link href={`${base}?tab=applications`} aria-current={tab === "applications" ? "page" : undefined}>
          Applications ({detail.candidateCount})
        </Link>
        <Link href={`${base}?tab=matches`} aria-current={tab === "matches" ? "page" : undefined}>Potential matches</Link>
        <Link href={`${base}?tab=description`} aria-current={tab === "description" ? "page" : undefined}>
          Edit description{readiness.ready ? "" : " · needs work"}
        </Link>
      </nav>

      {tab === "applications" ? <Applications requisitionId={requisitionId} /> : null}
      {tab === "matches" ? <PotentialMatches requisitionId={requisitionId} /> : null}
      {tab === "description" ? (
        <JobDescriptionEditor
          requisitionId={requisitionId}
          hasPosting={Boolean(posting)}
          locationName={posting?.locationName ?? detail.locationName}
          initial={{
            summary: posting?.summary ?? "",
            description: posting?.description ?? r.description,
            responsibilities: posting?.responsibilities ?? r.responsibilities,
            qualifications: posting?.qualifications ?? r.qualifications,
            preferredQualifications: posting?.preferredQualifications ?? r.preferredQualifications,
            experienceLevel: posting?.experienceLevel ?? "",
            applicationDeadline: posting?.applicationDeadline?.slice(0, 10) ?? "",
          }}
        />
      ) : null}
      {tab === "overview" ? (
        <section className="ws-panel">
          {readiness.ready ? null : (
            <p className="ws-note" style={{ marginBottom: 16 }}>
              This description is incomplete for publication ({readiness.checks.filter((c) => !c.ok).length} item
              {readiness.checks.filter((c) => !c.ok).length === 1 ? "" : "s"} to fix).{" "}
              <Link href={`${base}?tab=description`}>Complete it</Link>
            </p>
          )}
          <h2>Description</h2>
          <p style={{ whiteSpace: "pre-wrap", fontSize: 14.5 }}>{r.description}</p>
          {r.responsibilities.length ? (
            <>
              <h3>Responsibilities</h3>
              <ul className="ws-list">{r.responsibilities.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          ) : null}
          {r.qualifications.length ? (
            <>
              <h3>Qualifications</h3>
              <ul className="ws-list">{r.qualifications.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          ) : null}
          {r.preferredQualifications.length ? (
            <>
              <h3>Preferred</h3>
              <ul className="ws-list">{r.preferredQualifications.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

async function Applications({ requisitionId }: { requisitionId: string }) {
  const [applications, candidates] = await Promise.all([
    recruitingRepository.listApplicationsByRequisition(requisitionId),
    recruitingRepository.listCandidateSummaries(),
  ]);
  const names = new Map(candidates.map((c) => [c.candidateId, c.name]));
  return (
    <section className="ws-panel">
      {applications.length ? (
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Status</th>
                <th>Applied</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/app/recruiting/applications/${a.id}`}>{names.get(a.candidateId) ?? a.applicationNumber}</Link>
                    <div className="ws-muted">{a.applicationNumber}</div>
                  </td>
                  <td><span className="ws-pill">{applicationStatusLabels[a.status] ?? a.status}</span></td>
                  <td className="ws-muted">{fmtDate(a.appliedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ws-muted">No applications yet. Try Potential matches to search existing candidates.</p>
      )}
    </section>
  );
}

async function PotentialMatches({ requisitionId }: { requisitionId: string }) {
  const result = await findCandidatesForRequisition(requisitionId, 25);
  if (!result) notFound();
  const { requirements, matches, evaluated } = result;
  return (
    <div className="ws-grid-wide">
      <section className="ws-panel">
        <h2>Existing candidates who may fit</h2>
        <p className="ws-muted" style={{ marginBottom: 12 }}>
          Searched {evaluated} candidate{evaluated === 1 ? "" : "s"} with a parsed resume. Candidates without a parsed resume are not evaluated.
        </p>
        {matches.length ? (
          <ul className="ws-list">
            {matches.map((m) => (
              <li key={m.candidateId}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <Link href={`/app/recruiting/candidates/${m.candidateId}`} style={{ fontWeight: 600 }}>{m.candidateName}</Link>
                    {m.currentTitle ? <div className="ws-muted">{m.currentTitle}</div> : null}
                  </div>
                  <MatchScore analysis={m.analysis} />
                </div>
                <details style={{ marginTop: 8 }}>
                  <summary className="ws-muted" style={{ cursor: "pointer" }}>Why</summary>
                  <div style={{ marginTop: 8 }}>
                    <MatchAnalysis analysis={m.analysis} compact />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ws-muted">No parsed resumes to compare yet.</p>
        )}
      </section>
      <section className="ws-panel">
        <h2>Requirements used</h2>
        <h3>Required skills</h3>
        <div className="ws-chips">{requirements.requiredSkills.length ? requirements.requiredSkills.map((s) => <span key={s} className="ws-chip">{s}</span>) : <span className="ws-muted">None recognized in the job text.</span>}</div>
        <h3>Preferred skills</h3>
        <div className="ws-chips">{requirements.preferredSkills.length ? requirements.preferredSkills.map((s) => <span key={s} className="ws-chip">{s}</span>) : <span className="ws-muted">None</span>}</div>
        <h3>Experience</h3>
        <p className="ws-muted">{requirements.minimumYears !== null ? `${requirements.minimumYears}+ years` : "Not specified"}</p>
        <p className="ws-note">
          Matching reads only skills, dated experience, education and certifications from resumes. It never changes application status, and recruiters make every decision.
        </p>
      </section>
    </div>
  );
}
