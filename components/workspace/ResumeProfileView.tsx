import type { ResumeProfile } from "@/lib/recruiting/resume-profiles";

const STATUS: Record<ResumeProfile["status"], { label: string; tone: string }> = {
  PARSED: { label: "Resume parsed", tone: "green" },
  FAILED: { label: "Resume could not be parsed", tone: "amber" },
  UNSUPPORTED: { label: "Unsupported resume file", tone: "amber" },
};

export function ResumeProfileView({ profile }: { profile: ResumeProfile | null }) {
  if (!profile) {
    return <p className="ws-muted">No parsed resume yet. Profiles are created after a resume is submitted.</p>;
  }
  const status = STATUS[profile.status];
  const p = profile.structured;
  return (
    <div>
      <p>
        <span className={`ws-pill ${status.tone}`}>{status.label}</span>{" "}
        <span className="ws-muted">
          {new Date(profile.parsedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {profile.parserVersion}
        </span>
      </p>
      {profile.status !== "PARSED" || !p ? (
        <p className="ws-muted" style={{ marginTop: 8 }}>
          The original resume is still available to view. Reason: {profile.error?.replace(/_/g, " ") ?? "unknown"}.
        </p>
      ) : (
        <>
          {p.summary ? (
            <>
              <h3>Summary (from resume)</h3>
              <p style={{ fontSize: 14 }}>{p.summary}</p>
            </>
          ) : null}
          <h3>Skills</h3>
          {p.skills.length ? (
            <div className="ws-chips">
              {p.skills.map((s) => (
                <span key={s.name} className="ws-chip" title={s.evidence}>
                  {s.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="ws-muted">No recognized skills.</p>
          )}
          <h3>Experience{p.totalYearsExperience !== null ? ` · about ${p.totalYearsExperience} years dated` : ""}</h3>
          {p.experience.length ? (
            <ul className="ws-list">
              {p.experience.map((e, i) => (
                <li key={i}>
                  <strong>{e.title ?? "Role"}</strong>
                  {e.company ? ` · ${e.company}` : ""}
                  <div className="ws-muted">
                    {e.startDate ?? "?"} – {e.isCurrent ? "Present" : (e.endDate ?? "?")}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ws-muted">Not recognized in the resume.</p>
          )}
          <h3>Education</h3>
          {p.education.length ? (
            <ul className="ws-list">
              {p.education.map((e, i) => (
                <li key={i}>
                  <strong>{e.degree ?? "Degree"}</strong>
                  {e.fieldOfStudy ? ` in ${e.fieldOfStudy}` : ""}
                  {e.institution ? <div className="ws-muted">{e.institution}{e.endDate ? ` · ${e.endDate}` : ""}</div> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ws-muted">Not recognized in the resume.</p>
          )}
          {p.certifications.length ? (
            <>
              <h3>Certifications</h3>
              <ul className="ws-list">
                {p.certifications.map((c) => (
                  <li key={c.name}>{c.name}</li>
                ))}
              </ul>
            </>
          ) : null}
          {p.warnings.length ? <p className="ws-note">{p.warnings.join(" ")}</p> : null}
        </>
      )}
    </div>
  );
}
