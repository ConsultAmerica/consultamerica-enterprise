/**
 * Recruiter-facing publication readiness for a job description. Advisory:
 * it never publishes, unpublishes or changes public eligibility (that stays
 * in lib/jobs/eligibility.ts and the existing publication workflow). It tells
 * a recruiter what a posting is missing before they publish it.
 */

export type JobDescriptionDraft = {
  summary?: string;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  preferredQualifications: string[];
  locationName?: string;
};

export type ReadinessCheck = { id: string; label: string; ok: boolean; detail?: string };

export const READINESS_THRESHOLDS = {
  descriptionChars: 300,
  responsibilities: 3,
  qualifications: 3,
  summaryMin: 60,
  summaryMax: 300,
} as const;

/** Wording that marks a record as a test, sample or placeholder rather than a real vacancy. */
const PLACEHOLDER = /\b(qa verification|portal verification|lineage fixture|sample position|lorem ipsum|placeholder|tbd|to be determined|not a (?:real|customer-facing))\b/i;

export function assessJobCompleteness(draft: JobDescriptionDraft): { ready: boolean; checks: ReadinessCheck[] } {
  const t = READINESS_THRESHOLDS;
  const description = draft.description.trim();
  const summary = draft.summary?.trim() ?? "";
  const responsibilities = draft.responsibilities.filter((line) => line.trim());
  const qualifications = draft.qualifications.filter((line) => line.trim());
  const allText = [summary, description, ...responsibilities, ...qualifications, ...draft.preferredQualifications].join("\n");
  const placeholder = PLACEHOLDER.exec(allText)?.[0];

  const checks: ReadinessCheck[] = [
    {
      id: "description",
      label: `About the role is at least ${t.descriptionChars} characters`,
      ok: description.length >= t.descriptionChars,
      detail: `${description.length} characters`,
    },
    {
      id: "responsibilities",
      label: `At least ${t.responsibilities} key responsibilities`,
      ok: responsibilities.length >= t.responsibilities,
      detail: `${responsibilities.length} listed`,
    },
    {
      id: "qualifications",
      label: `At least ${t.qualifications} required qualifications`,
      ok: qualifications.length >= t.qualifications,
      detail: `${qualifications.length} listed`,
    },
    {
      id: "location",
      label: "Location is set",
      ok: Boolean(draft.locationName?.trim() && draft.locationName.trim() !== "—"),
    },
    {
      id: "placeholder",
      label: "No test, sample or placeholder wording",
      ok: !placeholder,
      detail: placeholder ? `Found “${placeholder}”` : undefined,
    },
  ];
  if (draft.summary !== undefined) {
    checks.splice(1, 0, {
      id: "summary",
      label: `Listing summary is ${t.summaryMin}–${t.summaryMax} characters`,
      ok: summary.length >= t.summaryMin && summary.length <= t.summaryMax,
      detail: `${summary.length} characters`,
    });
  }
  return { ready: checks.every((check) => check.ok), checks };
}

/** One entry per non-empty line; leading bullets ("•", "-", "*") removed. */
export function linesFrom(value: FormDataEntryValue | string | null | undefined): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean);
}
