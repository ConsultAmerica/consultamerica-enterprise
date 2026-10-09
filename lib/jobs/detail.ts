/**
 * Client-safe job-detail helpers. Every section is derived from the job's own
 * published fields — nothing is invented. Skills are taxonomy terms that
 * literally appear in the posting text (with the snippet that proves it);
 * education and certification lines are the posting's own lines, regrouped.
 */

import type { Job } from "@/lib/jobs/public-model";
import { findSkills } from "@/lib/recruiting/skill-taxonomy";

/**
 * The ConsultHire bot.
 *
 * Turned off for now: `enabled` false renders a non-interactive "Coming soon"
 * chip instead of a link, and the explanatory note is not shown at all. The
 * href is kept so re-enabling is a one-word change rather than a rebuild.
 *
 * When live it opens in a new tab and no candidate data is ever put in the URL.
 */
export const CONSULTHIRE_BOT = {
  enabled: false,
  label: "AI interview",
  comingSoonLabel: "AI interview — coming soon",
  href: "https://consulthire.vercel.app/",
  note: "Opens ConsultHire, our AI interview assistant, in a new tab. It doesn't submit an application for this role.",
} as const;

const EDUCATION = /\b(bachelor'?s?|master'?s?|degree|ph\.?d|doctorate|diploma|b\.?s\.?c?|m\.?s\.?c?|mba)\b/i;
const CERTIFICATION = /\bcertifi(ed|cation|cations)\b/i;
const YEARS = /(\d{1,2})\s*\+?\s*(?:or more\s+)?(?:years|yrs)\b/i;

export type JobSkill = { name: string; evidence: string };

export type JobSections = {
  about: string;
  responsibilities: string[];
  required: string[];
  preferred: string[];
  education: string[];
  /** Certification lines, each marked required or preferred as published. */
  certifications: { text: string; preferred: boolean }[];
  /** Highest "N+ years" stated in the required qualifications, if any. */
  minimumYears: number | null;
  skills: JobSkill[];
};

const clean = (lines: string[] | undefined) => (lines ?? []).map((line) => line.trim()).filter(Boolean);

export function buildJobSections(job: Pick<Job, "description" | "summary" | "responsibilities" | "qualifications" | "preferredQualifications">): JobSections {
  const qualifications = clean(job.qualifications);
  const preferredLines = clean(job.preferredQualifications);
  const responsibilities = clean(job.responsibilities);

  const education = qualifications.filter((line) => EDUCATION.test(line) && !CERTIFICATION.test(line));
  const certifications = [
    ...qualifications.filter((line) => CERTIFICATION.test(line)).map((text) => ({ text, preferred: false })),
    ...preferredLines.filter((line) => CERTIFICATION.test(line)).map((text) => ({ text, preferred: true })),
  ];
  const regrouped = new Set([...education, ...certifications.map((c) => c.text)]);

  const years = qualifications
    .map((line) => YEARS.exec(line)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);

  const about = job.description?.trim() || job.summary?.trim() || "";
  const text = [about, ...responsibilities, ...qualifications, ...preferredLines].join("\n");

  return {
    about,
    responsibilities,
    required: qualifications.filter((line) => !regrouped.has(line)),
    preferred: preferredLines.filter((line) => !regrouped.has(line)),
    education,
    certifications,
    minimumYears: years.length ? Math.max(...years) : null,
    skills: findSkills(text).map(({ name, evidence }) => ({ name, evidence })),
  };
}

/** Days until the closing date, or null without one. Negative once it has passed. */
export function daysUntil(date: string | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  const at = new Date(date).getTime();
  if (Number.isNaN(at)) return null;
  return Math.ceil((at - now.getTime()) / 86_400_000);
}

/**
 * Other open roles to show beside a job: same category first, then same
 * department, newest first. Never the job itself, never a closed one.
 */
export function relatedJobs<T extends Pick<Job, "id" | "categories" | "department" | "postedAt" | "acceptingApplications">>(
  job: T,
  all: T[],
  limit = 3,
): T[] {
  const categories = new Set(job.categories.map((category) => category.id));
  const score = (other: T) =>
    (other.categories.some((category) => categories.has(category.id)) ? 2 : 0) + (other.department === job.department ? 1 : 0);
  return all
    .filter((other) => other.id !== job.id && other.acceptingApplications && score(other) > 0)
    .sort((a, b) => score(b) - score(a) || new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
    .slice(0, limit);
}
