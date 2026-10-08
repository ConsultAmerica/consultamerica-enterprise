import Link from "next/link";

import { humanize } from "@/components/workspace/format";
import { recruitingRepository } from "@/lib/recruiting";
import { MATCH_DISCLAIMER } from "@/lib/recruiting/job-analyzer";

export const metadata = { title: "Candidate Match" };

export default async function CandidateMatchPage() {
  const jobs = (await recruitingRepository.listJobSummaries()).filter((j) => !["CANCELLED", "FILLED"].includes(j.status));
  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Recruiting</p>
          <h1>Candidate match</h1>
          <p>Pick a requisition to search the parsed resumes of existing candidates. Open a candidate to see the jobs they may fit.</p>
        </div>
      </div>
      <section className="ws-panel">
        <ul className="ws-list">
          {jobs.map((j) => (
            <li key={j.requisitionId} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span>
                <strong>{j.title}</strong>
                <div className="ws-muted">
                  {j.requisitionNumber} · {j.locationName} · {humanize(j.status)}
                </div>
              </span>
              <Link className="ws-btn" href={`/app/recruiting/jobs/${j.requisitionId}?tab=matches`}>
                Find existing candidates
              </Link>
            </li>
          ))}
        </ul>
        <p className="ws-note">{MATCH_DISCLAIMER}</p>
      </section>
    </>
  );
}
