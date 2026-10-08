import Link from "next/link";

import { fmtDate, humanize } from "@/components/workspace/format";
import { recruitingRepository } from "@/lib/recruiting";
import { employmentTypeLabels, workplaceTypeLabels } from "@/types/organization";

export const metadata = { title: "Jobs" };

export default async function JobsPage() {
  const jobs = await recruitingRepository.listJobSummaries();
  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Recruiting</p>
          <h1>Jobs &amp; requisitions</h1>
          <p>Every requisition, including drafts created from Job Intake. Drafts are not public until published.</p>
        </div>
      </div>
      <section className="ws-panel">
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>Requisition</th>
                <th>Department</th>
                <th>Location</th>
                <th>Status</th>
                <th>Applicants</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.requisitionId}>
                  <td>
                    <Link href={`/app/recruiting/jobs/${j.requisitionId}`}>{j.title}</Link>
                    <div className="ws-muted">
                      {j.requisitionNumber} · {employmentTypeLabels[j.employmentType] ?? j.employmentType} · {workplaceTypeLabels[j.workplaceType] ?? j.workplaceType}
                    </div>
                  </td>
                  <td>{j.departmentName}</td>
                  <td>{j.locationName}</td>
                  <td>
                    <span className={`ws-pill ${j.status === "DRAFT" ? "amber" : j.status === "PUBLISHED" ? "blue" : ""}`}>{humanize(j.status)}</span>
                  </td>
                  <td>{j.candidateCount}</td>
                  <td className="ws-muted">{fmtDate(j.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
