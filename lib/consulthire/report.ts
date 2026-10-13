/**
 * Reading ConsultHire's evaluation report.
 *
 * interviews.report is jsonb, so the driver already hands back a parsed value.
 * What it does NOT hand back is any guarantee about the shape: the JSON was
 * produced by a different product, by a model, and whatever version of the
 * scorer was deployed on the day the interview happened. A report written six
 * months ago is still in the database and still has to render.
 *
 * So nothing here trusts the stored value. Every field is read through a
 * narrowing helper and a missing or wrong-typed one becomes an empty array or a
 * null, never a throw. THE REASON IS SPECIFIC: the application detail page is
 * the screen a recruiter uses to decide about a real person, and a report whose
 * `strengths` arrived as a string instead of an array must cost that page one
 * empty section, not a 500 that hides the candidate's contact details, résumé
 * and notes as well.
 *
 * No `server-only` import: this is pure narrowing over a plain value and is
 * imported by the admin page, which is a server component but need not be.
 */

/** One competency line from the score breakdown. */
export type ReportCompetency = {
  label: string;
  /** 1 to 10, or null when the interview gave nothing to judge it on. */
  score: number | null;
};

export type ReportEvidence = {
  point: string;
  /** A short candidate quote backing the point, when the scorer captured one. */
  quote: string | null;
};

/**
 * The parts of the report this dashboard renders.
 *
 * A deliberate subset, not a mirror of ConsultHire's EvaluationReport type.
 * Copying that interface across the boundary would make every field it adds a
 * compile error here and every field it drops a lie, and this side only needs
 * the six things the panel shows.
 */
export type ConsultHireReport = {
  /** "Strong match", "Possible match", ... as the scorer worded it. */
  recommendation: string | null;
  /** One-line headline signal. */
  keySignal: string | null;
  confidence: string | null;
  /**
   * True when the session was too short or too interrupted to judge. Shown
   * prominently: a low score and an abandoned interview look identical in a
   * number, and only one of them says anything about the candidate.
   */
  incomplete: boolean;
  competencies: ReportCompetency[];
  strengths: string[];
  concerns: string[];
  evidence: ReportEvidence[];
};

/** True when there is something worth rendering, as opposed to an empty shell. */
export function reportHasContent(report: ConsultHireReport): boolean {
  return (
    report.competencies.length > 0 ||
    report.strengths.length > 0 ||
    report.concerns.length > 0 ||
    report.evidence.length > 0 ||
    report.keySignal !== null ||
    report.recommendation !== null
  );
}

/**
 * Narrow a stored report, or null when there is nothing usable.
 *
 * Accepts a string as well as an object. jsonb normally arrives parsed, but the
 * same payload is also written by the webhook straight from ConsultHire, where
 * `report` is a stringified JSON field, and a future code path that stores it
 * without parsing first should render rather than crash.
 */
export function parseConsultHireReport(raw: unknown): ConsultHireReport | null {
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  if (!isRecord(value)) return null;

  const report: ConsultHireReport = {
    recommendation: text(value.recommendation),
    keySignal: text(value.keySignal),
    confidence: text(value.confidence),
    incomplete: value.incomplete === true,
    competencies: competencies(value.breakdown),
    strengths: strings(value.strengths),
    concerns: strings(value.concerns),
    evidence: evidence(value.evidence),
  };

  return reportHasContent(report) ? report : null;
}

// ------------------------------------------------------------------ narrowing

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A trimmed non-empty string, else null. Capped: this is rendered in a panel. */
function text(value: unknown, max = 600): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, max);
}

/**
 * A list of short strings.
 *
 * Length-capped as well as count-capped. A model can produce a thirty-item
 * "strengths" list, and a panel showing thirty bullets is a panel nobody reads.
 */
function strings(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, 400))
    .filter((item): item is string => item !== null)
    .slice(0, maxItems);
}

function competencies(value: unknown): ReportCompetency[] {
  if (!Array.isArray(value)) return [];
  const out: ReportCompetency[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    // `key` is the machine name and `label` is the human one. Falling back to
    // the key means a report from a scorer that stopped sending labels still
    // renders something a recruiter can read, rather than a blank row.
    const label = text(item.label, 120) ?? text(item.key, 120);
    if (!label) continue;
    out.push({ label, score: score(item.score) });
    if (out.length >= 12) break;
  }
  return out;
}

function evidence(value: unknown): ReportEvidence[] {
  if (!Array.isArray(value)) return [];
  const out: ReportEvidence[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const point = text(item.point, 400);
    if (!point) continue;
    out.push({ point, quote: text(item.quote, 400) });
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * A 0-10 score, or null.
 *
 * Clamped rather than rejected when out of range: a model that returns 11 has
 * still said "excellent", and showing 10 is closer to the truth than showing
 * nothing. NaN and Infinity are rejected, because they would reach the page as
 * the literal text "NaN".
 */
export function score(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(0, n));
}
