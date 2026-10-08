import Link from "next/link";

import { fmtDate } from "@/components/workspace/format";
import { recruitingRepository } from "@/lib/recruiting";
import { applicationStatusLabels } from "@/types/recruiting";

export const metadata = { title: "Candidates" };

export default async function CandidatesPage() {
  const rows = await recruitingRepository.listCandidateSummaries();
  // One row per candidate (summaries can repeat per application).
  const byCandidate = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const current = byCandidate.get(row.candidateId);
    if (!current || row.lastActivityAt > current.lastActivityAt) byCandidate.set(row.candidateId, row);
  }
  const candidates = [...byCandidate.values()].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Recruiting</p>
          <h1>Candidates</h1>
          <p>Everyone who has applied through Easy Apply or Detailed Apply — one canonical candidate record each.</p>
        </div>
      </div>
      <section className="ws-panel">
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Latest role</th>
                <th>Stage</th>
                <th>Location</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.candidateId}>
                  <td>
                    <Link href={`/app/recruiting/candidates/${c.candidateId}`}>{c.name}</Link>
                    <div className="ws-muted">{c.email}</div>
                  </td>
                  <td>{c.role}</td>
                  <td>{c.stage ? <span className="ws-pill">{applicationStatusLabels[c.stage] ?? c.stage}</span> : "—"}</td>
                  <td>{c.location || "—"}</td>
                  <td className="ws-muted">{fmtDate(c.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
