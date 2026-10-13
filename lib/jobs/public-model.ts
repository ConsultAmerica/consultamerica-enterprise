/**
 * Client-safe public Job view-model helpers.
 * Do NOT import recruiting/Supabase from this module.
 */

import type { CareerArea } from "@/types/recruiting";

export type Job = {
  id: string;
  slug: string;
  title: string;
  department: string;
  careerArea: CareerArea;
  location: string;
  workplaceType: "Remote" | "Hybrid" | "On-site";
  employmentType: "Full Time" | "Part Time" | "Contract" | "Temporary" | "Internship";
  summary: string;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  preferredQualifications?: string[];
  postedAt: string;
  status: "open" | "closed";
  acceptingApplications: boolean;
  isNew: boolean;
  isDemo: boolean;
  requisitionId: string;
  /** Public reference number (e.g. REQ-2026-0142); falls back to the requisition id. */
  referenceNumber: string;
  /** Application deadline, else listing expiry — the date applications close, if set. */
  closesAt?: string;
  company: string;
  companySummary?: string;
  experienceLevel?: string;
  applicationType: "INTERNAL" | "EXTERNAL";
  externalApplyUrl?: string;
  salaryLabel?: string;
  salaryMin?: number;
  salaryMax?: number;
  skills: string[];
  categories: { id: string; label: string }[];
  verified: boolean;
  /**
   * What the role offers. Optional because the Supabase-era schema has no
   * column for it; jobs created in the admin populate it. Without this the
   * benefits an admin types in are stored and then never shown to anyone,
   * which is the worst of both.
   */
  benefits?: string[];
  /**
   * True when this role has a generated ConsultHire interview and the public
   * posting may offer the AI route alongside Easy Apply.
   *
   * A BOOLEAN, NOT THE SLUG OR THE URL. This type crosses into client
   * components, so anything on it is serialised into the page. The link itself
   * is never needed there: the candidate reaches ConsultHire through
   * /jobs/[slug]/ai-interview, which creates their application first and then
   * mints a signed, candidate-specific launch URL server-side. Putting the raw
   * role link in the HTML would offer a way to sit the interview with no
   * application behind it, and the result would arrive at a row that does not
   * exist.
   *
   * Optional because the Supabase-backed mapping has no equivalent column.
   * Absent reads as false, which is the correct answer for every job that came
   * from that source.
   */
  aiInterviewReady?: boolean;
};

export type JobFilters = {
  query?: string;
  location?: string;
  careerArea?: string;
  workplaceType?: string;
  employmentType?: string;
};

export function formatPostedDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Whether the workplace label is worth printing next to this location.
 *
 * WHY THE PAIR IS SOMETIMES REDUNDANT, which is a fact about the data and not
 * a render mistake. A job carries two independent columns: `location`, which is
 * free text an admin types, and `workplace_type`, which is an enum the admin
 * picks. For a remote role both sincerely describe the same thing, and admins
 * write the obvious location:
 *
 *   CA-2026-0003   location "Remote (US)"   workplace_type REMOTE
 *   CA-2026-0005   location "Remote (US)"   workplace_type REMOTE
 *   CA-2026-0001   location "Ashburn, VA"   workplace_type HYBRID
 *
 * So the meta line on a remote posting reads "Remote (US) · Remote · Full Time"
 * and says Remote twice, while the hybrid one reads correctly. Only remote
 * roles are affected, because only for remote does a location name the work
 * arrangement.
 *
 * A DISPLAY RULE, NOT A DATA FIX. Both columns are legitimate and neither is
 * wrong: "Remote (US)" carries the eligibility region, which REMOTE alone does
 * not, and workplace_type is what the /jobs filters and the admin list filter
 * on, so normalising either one would break filtering to tidy a label. The
 * redundancy is removed at the point of rendering and nowhere else.
 *
 * The test is deliberately narrow: hide the workplace label only when the type
 * is Remote AND the location text already says so. A HYBRID role based in a
 * place called "Remote (US)" keeps both labels, because "remote-ish location,
 * hybrid arrangement" is information rather than repetition.
 *
 * Accepts loose strings on purpose. The view-model spells these "Remote" and
 * "On-site" while the Neon row spells them REMOTE and ONSITE, and both call
 * sites exist; matching case-insensitively means one helper serves both instead
 * of each caller remembering to normalise first.
 */
export function showWorkplaceType(
  location: string | null | undefined,
  workplaceType: string | null | undefined,
): boolean {
  if (!workplaceType) return false;
  if (!/^remote$/i.test(workplaceType.trim())) return true;
  return !/remote/i.test(location ?? "");
}

/**
 * The location and workplace labels that should actually be shown, in order.
 *
 * A convenience over showWorkplaceType for the several call sites that join the
 * pair into one line with separators: they need a list to join, and building it
 * from the predicate at each site is where a "·" gets left stranded next to a
 * label that is no longer there.
 */
export function locationLabels(
  location: string | null | undefined,
  workplaceType: string | null | undefined,
): string[] {
  const labels: string[] = [];
  if (location?.trim()) labels.push(location.trim());
  if (showWorkplaceType(location, workplaceType)) labels.push((workplaceType ?? "").trim());
  return labels.filter(Boolean);
}
