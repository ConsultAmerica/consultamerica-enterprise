import { MATCH_DISCLAIMER, type JobAnalysis } from "@/lib/recruiting/job-analyzer";

const BAND: Record<JobAnalysis["band"], { label: string; tone: string }> = {
  STRONG: { label: "Strong potential match", tone: "green" },
  MODERATE: { label: "Moderate potential match", tone: "blue" },
  LIMITED: { label: "Limited potential match", tone: "amber" },
  INSUFFICIENT_DATA: { label: "Not enough data to score", tone: "" },
};

const ALIGN: Record<string, string> = {
  ALIGNED: "Aligned",
  BELOW: "Below stated requirement",
  UNKNOWN: "Unknown",
  NOT_SPECIFIED: "Not specified by job",
};

export function MatchScore({ analysis }: { analysis: JobAnalysis }) {
  const band = BAND[analysis.band];
  return analysis.score === null ? (
    <span className="ws-pill">{band.label}</span>
  ) : (
    <span className={`ws-pill ${band.tone}`}>{analysis.score}% · {band.label.replace(" potential match", "")}</span>
  );
}

export function MatchAnalysis({ analysis, compact = false }: { analysis: JobAnalysis; compact?: boolean }) {
  const band = BAND[analysis.band];
  return (
    <div>
      <div className="ws-score">
        <strong>{analysis.score === null ? "—" : `${analysis.score}%`}</strong>
        <span className={`ws-pill ${band.tone}`}>{band.label}</span>
      </div>

      <h3>Matched</h3>
      {analysis.matched.length ? (
        <div className="ws-chips">
          {analysis.findings
            .filter((f) => f.status === "MATCHED")
            .map((f) => (
              <span key={f.requirement} className="ws-chip matched" title={f.evidence ?? undefined}>
                ✓ {f.requirement}
                {f.kind === "preferred" ? " (preferred)" : ""}
              </span>
            ))}
        </div>
      ) : (
        <p className="ws-muted">No listed skills matched.</p>
      )}

      {analysis.notFound.length ? (
        <>
          <h3>Not found in resume</h3>
          <div className="ws-chips">
            {analysis.findings
              .filter((f) => f.status === "NOT_FOUND")
              .map((f) => (
                <span key={f.requirement} className="ws-chip notfound">
                  ○ {f.requirement}
                  {f.kind === "preferred" ? " (preferred)" : ""}
                </span>
              ))}
          </div>
        </>
      ) : null}

      {analysis.unknown.length ? (
        <>
          <h3>Unknown (no parsed resume)</h3>
          <div className="ws-chips">
            {analysis.unknown.map((u) => (
              <span key={u} className="ws-chip">
                ? {u}
              </span>
            ))}
          </div>
        </>
      ) : null}

      {compact ? null : (
        <>
          <h3>Alignment</h3>
          <dl className="ws-dl">
            <dt>Experience</dt>
            <dd>
              <strong>{ALIGN[analysis.experience.status]}</strong> — {analysis.experience.detail}
            </dd>
            <dt>Education</dt>
            <dd>
              <strong>{ALIGN[analysis.education.status]}</strong> — {analysis.education.detail}
            </dd>
            <dt>Certifications</dt>
            <dd>
              <strong>{ALIGN[analysis.certifications.status]}</strong> — {analysis.certifications.detail}
            </dd>
          </dl>
        </>
      )}
      <p className="ws-note">{MATCH_DISCLAIMER}</p>
    </div>
  );
}
