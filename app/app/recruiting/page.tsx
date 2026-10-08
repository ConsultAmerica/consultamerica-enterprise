import Link from "next/link";

import { fmtDate } from "@/components/workspace/format";
import { getIntakeRuntime } from "@/lib/email-intake/runtime";
import { recruitingRepository } from "@/lib/recruiting";
import { applicationStatusLabels } from "@/types/recruiting";

export const metadata = { title: "Overview" };

export default async function RecruitingOverview() {
  const [jobs, candidates, applications] = await Promise.all([
    recruitingRepository.listJobSummaries(),
    recruitingRepository.listCandidateSummaries(),
    recruitingRepository.listApplicationsQueue(),
  ]);
  let intakeOpen: number | null = null;
  try {
    const counts = await getIntakeRuntime().repo.countByStatus();
    intakeOpen = (counts.REVIEW_REQUIRED ?? 0) + (counts.FAILED ?? 0);
  } catch {
    intakeOpen = null; // intake tables not migrated yet
  }
  const openJobs = jobs.filter((j) => !["CANCELLED", "FILLED"].includes(j.status));
  const recent = [...applications].sort((a, b) => b.appliedAt.localeCompare(a.appliedAt)).slice(0, 8);

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Recruiting</p>
          <h1>Overview</h1>
        </div>
      </div>
      <div className="ws-stats">
        <Link href="/app/recruiting/jobs" className="ws-stat">
          <strong>{openJobs.length}</strong>
          <span>Active requisitions</span>
        </Link>
        <Link href="/app/recruiting/candidates" className="ws-stat">
          <strong>{new Set(candidates.map((c) => c.candidateId)).size}</strong>
          <span>Candidates</span>
        </Link>
        <Link href="/app/recruiting/applications" className="ws-stat">
          <strong>{applications.length}</strong>
          <span>Applications</span>
        </Link>
        <Link href="/app/recruiting/job-intake" className="ws-stat">
          <strong>{intakeOpen ?? "—"}</strong>
          <span>Intake emails to review</span>
        </Link>
      </div>
      <section className="ws-panel">
        <h2>Recent applications</h2>
        {recent.length ? (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Applied</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.applicationId}>
                    <td>
                      <Link href={`/app/recruiting/applications/${a.applicationId}`}>{a.candidateName}</Link>
                    </td>
                    <td>{a.jobTitle}</td>
                    <td>
                      <span className="ws-pill">{applicationStatusLabels[a.status] ?? a.status}</span>
                    </td>
                    <td className="ws-muted">{fmtDate(a.appliedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ws-muted">No applications yet.</p>
        )}
      </section>
    </>
  );
}
