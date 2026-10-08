/**
 * Job Analyzer — deterministic, explainable recruiter decision support.
 *
 * Supersedes functional-source analyzeJobMatch (keyword overlap over typed
 * profile text, clamped 12–96). Differences:
 *  - requirements come from the job's own text via the shared skill taxonomy,
 *    split into required vs preferred;
 *  - each requirement is MATCHED (with resume evidence), NOT_FOUND (resume was
 *    parsed and does not mention it — "not found in resume", NOT "lacks"), or
 *    UNKNOWN (no parsed resume to check);
 *  - UNKNOWN never lowers the score, and no score is produced without data.
 *
 * Inputs are skills, experience, education and certifications only. Name,
 * contact details, location, age, gender or any other personal attribute are
 * never read. Output never changes application state — callers only display it.
 */

import type { ParsedResume } from "@/lib/recruiting/resume-parser";
import { canonicalSkill, findSkills } from "@/lib/recruiting/skill-taxonomy";

export type JobRequirementSource = {
  title: string;
  description?: string | null;
  responsibilities?: string[];
  qualifications?: string[];
  preferredQualifications?: string[];
  /** Skills already attached to the job (e.g. jobs.skills). */
  skills?: string[];
};

export type JobRequirements = {
  title: string;
  requiredSkills: string[];
  preferredSkills: string[];
  minimumYears: number | null;
  degreeRequired: string | null;
  certificationsRequired: string[];
};

export type FindingStatus = "MATCHED" | "NOT_FOUND" | "UNKNOWN";

export type MatchFinding = {
  requirement: string;
  kind: "required" | "preferred";
  status: FindingStatus;
  evidence: string | null;
};

export type AlignmentStatus = "ALIGNED" | "BELOW" | "UNKNOWN" | "NOT_SPECIFIED";

export type JobAnalysis = {
  /** 0–100, or null when there is not enough data to score. */
  score: number | null;
  band: "STRONG" | "MODERATE" | "LIMITED" | "INSUFFICIENT_DATA";
  findings: MatchFinding[];
  matched: string[];
  notFound: string[];
  unknown: string[];
  experience: { status: AlignmentStatus; detail: string };
  education: { status: AlignmentStatus; detail: string };
  certifications: { status: AlignmentStatus; detail: string };
  explanation: string[];
};

export const MATCH_DISCLAIMER =
  "Potential match for recruiter review only. It is not a hiring decision and does not change application status. \"Not found in resume\" means the resume does not mention it, not that the candidate lacks it.";

const YEARS = /\b(\d{1,2})\+?\s*(?:years|yrs)\b/i;
const DEGREE_REQ = /\b(bachelor'?s|master'?s|degree|b\.?s\.?|m\.?s\.?|mba|ph\.?d)\b/i;
const CERT_REQ = /\b(certified|certification|certificate)\b/i;

export function requirementsFromJob(job: JobRequirementSource): JobRequirements {
  const preferredText = (job.preferredQualifications ?? []).join("\n");
  const requiredText = [job.title, job.description ?? "", ...(job.responsibilities ?? []), ...(job.qualifications ?? [])].join("\n");

  const required = new Set<string>();
  for (const s of job.skills ?? []) required.add(canonicalSkill(s));
  for (const hit of findSkills(requiredText)) required.add(hit.name);
  const preferred = new Set<string>();
  for (const hit of findSkills(preferredText)) if (!required.has(hit.name)) preferred.add(hit.name);

  const qualText = (job.qualifications ?? []).join("\n") || job.description || "";
  const years = YEARS.exec(qualText) ?? YEARS.exec(job.description ?? "");
  const degreeLine = (job.qualifications ?? []).find((q) => DEGREE_REQ.test(q)) ?? null;
  const certs = (job.qualifications ?? []).filter((q) => CERT_REQ.test(q));

  return {
    title: job.title,
    requiredSkills: [...required],
    preferredSkills: [...preferred],
    minimumYears: years ? Number(years[1]) : null,
    degreeRequired: degreeLine,
    certificationsRequired: certs,
  };
}

export type CandidateEvidence = {
  /** Latest successfully parsed resume, or null if none. */
  parsed: ParsedResume | null;
  /** Extracted resume text (for evidence lookup). */
  resumeText: string | null;
  /** Skills the candidate confirmed (e.g. Detailed Apply or recruiter-entered). */
  confirmedSkills?: string[];
};

export function analyzeCandidateForJob(candidate: CandidateEvidence, requirements: JobRequirements): JobAnalysis {
  const hasResume = Boolean(candidate.parsed && candidate.resumeText);
  const skillEvidence = new Map<string, string>();
  if (candidate.parsed) for (const s of candidate.parsed.skills) skillEvidence.set(s.name, s.evidence);
  if (candidate.resumeText) for (const hit of findSkills(candidate.resumeText)) if (!skillEvidence.has(hit.name)) skillEvidence.set(hit.name, hit.evidence);
  for (const s of candidate.confirmedSkills ?? []) {
    const name = canonicalSkill(s);
    if (!skillEvidence.has(name)) skillEvidence.set(name, "Confirmed by candidate");
  }
  const canJudgeSkills = hasResume || skillEvidence.size > 0;

  const findings: MatchFinding[] = [];
  const judge = (requirement: string, kind: MatchFinding["kind"]) => {
    const evidence = skillEvidence.get(requirement) ?? null;
    findings.push({ requirement, kind, status: evidence ? "MATCHED" : canJudgeSkills ? "NOT_FOUND" : "UNKNOWN", evidence });
  };
  requirements.requiredSkills.forEach((r) => judge(r, "required"));
  requirements.preferredSkills.forEach((r) => judge(r, "preferred"));

  // Experience
  const years = candidate.parsed?.totalYearsExperience ?? null;
  const experience =
    requirements.minimumYears === null
      ? { status: "NOT_SPECIFIED" as const, detail: "The job does not state a minimum number of years." }
      : years === null
        ? { status: "UNKNOWN" as const, detail: `The job asks for ${requirements.minimumYears}+ years; dated work history was not found in the resume.` }
        : years >= requirements.minimumYears
          ? { status: "ALIGNED" as const, detail: `About ${years} years of dated experience in the resume; the job asks for ${requirements.minimumYears}+.` }
          : { status: "BELOW" as const, detail: `About ${years} years of dated experience found in the resume; the job asks for ${requirements.minimumYears}+. Undated roles are not counted.` };

  const education = !requirements.degreeRequired
    ? { status: "NOT_SPECIFIED" as const, detail: "No degree requirement stated." }
    : !hasResume
      ? { status: "UNKNOWN" as const, detail: `Requirement: ${requirements.degreeRequired}` }
      : (candidate.parsed?.education.some((e) => e.degree) ?? false)
        ? { status: "ALIGNED" as const, detail: `Degree listed in resume (${candidate.parsed!.education.map((e) => e.degree).filter(Boolean).join(", ")}). Confirm it meets: ${requirements.degreeRequired}` }
        : { status: "UNKNOWN" as const, detail: `No degree found in resume. Requirement: ${requirements.degreeRequired}` };

  const certifications = !requirements.certificationsRequired.length
    ? { status: "NOT_SPECIFIED" as const, detail: "No certification requirement stated." }
    : !hasResume
      ? { status: "UNKNOWN" as const, detail: requirements.certificationsRequired.join("; ") }
      : (candidate.parsed?.certifications.length ?? 0) > 0
        ? { status: "ALIGNED" as const, detail: `Resume lists: ${candidate.parsed!.certifications.map((c) => c.name).slice(0, 4).join("; ")}. Compare with: ${requirements.certificationsRequired.join("; ")}` }
        : { status: "UNKNOWN" as const, detail: `No certifications found in resume. Job mentions: ${requirements.certificationsRequired.join("; ")}` };

  // Score: weighted over what can actually be judged.
  let earned = 0;
  let possible = 0;
  for (const f of findings) {
    if (f.status === "UNKNOWN") continue;
    const weight = f.kind === "required" ? 1 : 0.4;
    possible += weight;
    if (f.status === "MATCHED") earned += weight;
  }
  if (experience.status === "ALIGNED" || experience.status === "BELOW") {
    possible += 1;
    if (experience.status === "ALIGNED") earned += 1;
  }

  const judgedRequired = findings.filter((f) => f.kind === "required" && f.status !== "UNKNOWN").length;
  const score = possible > 0 && judgedRequired > 0 ? Math.round((earned / possible) * 100) : null;
  const band: JobAnalysis["band"] = score === null ? "INSUFFICIENT_DATA" : score >= 75 ? "STRONG" : score >= 50 ? "MODERATE" : "LIMITED";

  const matched = findings.filter((f) => f.status === "MATCHED").map((f) => f.requirement);
  const notFound = findings.filter((f) => f.status === "NOT_FOUND").map((f) => f.requirement);
  const unknown = findings.filter((f) => f.status === "UNKNOWN").map((f) => f.requirement);

  const explanation: string[] = [];
  if (!requirements.requiredSkills.length) explanation.push("The job text has no recognized skill requirements, so skills could not be compared.");
  if (!hasResume && !candidate.confirmedSkills?.length) explanation.push("No parsed resume is available for this candidate; results are unknown rather than negative.");
  if (matched.length) explanation.push(`Matched ${matched.length} of ${requirements.requiredSkills.length + requirements.preferredSkills.length} listed skills.`);
  if (notFound.length) explanation.push(`Not found in resume: ${notFound.join(", ")}.`);
  explanation.push(experience.detail);

  return { score, band, findings, matched, notFound, unknown, experience, education, certifications, explanation };
}

export type RankedCandidate<T> = { candidate: T; analysis: JobAnalysis };

/** Ranks candidates for one job; candidates without a score sort last. */
export function rankCandidates<T>(
  requirements: JobRequirements,
  candidates: { candidate: T; evidence: CandidateEvidence }[],
  limit = 25,
): RankedCandidate<T>[] {
  return candidates
    .map(({ candidate, evidence }) => ({ candidate, analysis: analyzeCandidateForJob(evidence, requirements) }))
    .sort((a, b) => (b.analysis.score ?? -1) - (a.analysis.score ?? -1))
    .slice(0, limit);
}
