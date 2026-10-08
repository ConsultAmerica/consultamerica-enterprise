import Link from "next/link";

import { fmtDate } from "@/components/workspace/format";
import { recruitingRepository } from "@/lib/recruiting";
import { applicationStatusLabels } from "@/types/recruiting";

export const metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const rows = (await recruitingRepository.listApplicationsQueue()).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Recruiting</p>
          <h1>Applications</h1>
        </div>
      </div>
      <section className="ws-panel">
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
              {rows.map((a) => (
                <tr key={a.applicationId}>
                  <td>
                    <Link href={`/app/recruiting/applications/${a.applicationId}`}>{a.candidateName}</Link>
                    <div className="ws-muted">{a.applicationNumber}</div>
                  </td>
                  <td>
                    {a.jobTitle}
                    <div className="ws-muted">{[a.departmentName, a.locationName].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>
                    <span className="ws-pill">{applicationStatusLabels[a.status] ?? a.status}</span>
                  </td>
                  <td className="ws-muted">{fmtDate(a.appliedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
