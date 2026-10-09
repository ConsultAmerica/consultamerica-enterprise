/**
 * Neon rows to the public careers view-model.
 *
 * The public pages (/careers, /jobs, /jobs/[slug]) render `Job` from
 * lib/jobs/public-model.ts, and the components that consume it already work.
 * So the whole job of this file is translation: read the Neon `jobs` table and
 * hand back `Job` values, so the UI needs no changes and the recruiting
 * (Supabase) layer drops out of the public read path entirely.
 *
 * Nothing here swallows errors. A failed read throws, and each page decides
 * what a visitor should see, because only the page knows whether an empty list
 * can be rendered honestly (/careers, /jobs) or whether a missing row has to be
 * told apart from an unreachable database (/jobs/[slug]). Hiding the failure in
 * here would force both pages into the same, wrong answer.
 */

import { isNewListing } from "@/lib/jobs/eligibility";
import { categoriesFor, skillsFor } from "@/lib/jobs/portal";
import type { Job } from "@/lib/jobs/public-model";

import { getJobBySlug, listPublishedJobs } from "./jobs";
import type { EmploymentType, JobRow, WorkplaceType } from "./types";

/**
 * Neon stores the enums SCREAMING_SNAKE; the view-model is Title Case.
 *
 * These are `Record<Enum, ...>` rather than lookups with a fallback so that
 * widening a CHECK constraint (lib/neon/types.ts says to expect that) breaks
 * the build here instead of rendering a blank cell on the careers page.
 *
 * types/organization.ts has label maps of its own, but they are keyed to the
 * Supabase enums: its EmploymentType has no INTERNSHIP, which Neon's does.
 * Reusing them would silently produce `undefined` for an internship posting.
 */
const WORKPLACE_LABELS: Record<WorkplaceType, Job["workplaceType"]> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ONSITE: "On-site",
};

const EMPLOYMENT_LABELS: Record<EmploymentType, Job["employmentType"]> = {
  FULL_TIME: "Full Time",
  PART_TIME: "Part Time",
  CONTRACT: "Contract",
  TEMPORARY: "Temporary",
  INTERNSHIP: "Internship",
};

/**
 * Every job in this table is ours. The Neon schema has no employer column
 * because this is Consult America's own ATS, not a job board.
 */
const COMPANY_NAME = "Consult America";

/**
 * `careerArea` is required by the view-model and has no column in Neon.
 *
 * "experienced-professionals" is the one safe constant: `filterJobs` treats it
 * as "anything that is not early-careers", so a Neon role stays visible under
 * the broadest career-area filter rather than disappearing into a bucket a
 * visitor has to guess. Deriving it from the department string would file roles
 * under areas nobody chose, and would change silently when a department is
 * renamed. When the area becomes a real editorial decision it belongs in the
 * schema and the admin form, not in a regex over `department`.
 */
const DEFAULT_CAREER_AREA: Job["careerArea"] = "experienced-professionals";

/** Roughly one line in a list card and a usable SEO description. */
const SUMMARY_MAX_CHARS = 220;

/**
 * Public list: every PUBLISHED job, newest first.
 *
 * Returns roles whose application deadline has passed as well, with
 * `acceptingApplications` false — `queryPortalJobs` filters those out of /jobs
 * for us, and /jobs/[slug] needs them so a shared link explains itself instead
 * of 404ing.
 */
export async function listPublicJobs(): Promise<Job[]> {
  const rows = await listPublishedJobs();
  // One timestamp for the whole page, so two cards cannot disagree about
  // whether a deadline has just passed.
  const now = new Date();
  return rows.map((row) => toPublicJob(row, now));
}

/**
 * Public detail lookup. Null when there is no such job, or when it exists but
 * is not PUBLISHED.
 *
 * The status check lives here rather than in lib/neon/jobs.ts on purpose: that
 * function returns a row at any status so the admin can preview a draft. A
 * public page must not, so a DRAFT, UNPUBLISHED or ARCHIVED row reads as a
 * miss. Anything else would make /jobs/<slug> a way to read unpublished copy.
 */
export async function getPublicJobBySlug(slug: string): Promise<Job | null> {
  const trimmed = slug.trim();
  if (trimmed === "") {
    return null;
  }

  const row = await getJobBySlug(trimmed);
  if (!row || row.status !== "PUBLISHED") {
    return null;
  }
  return toPublicJob(row);
}

/**
 * Row to view-model. Exported for the pages that already hold rows, and so the
 * mapping can be tested without a database.
 */
export function toPublicJob(row: JobRow, now: Date = new Date()): Job {
  // published_at is null for a row that reached PUBLISHED before the column
  // existed, or through a direct SQL edit. created_at is the honest fallback.
  const postedAt = (toDate(row.published_at) ?? toDate(row.created_at) ?? now).toISOString();
  const deadline = toDate(row.application_deadline);

  // The schema calls application_deadline decorative because status alone
  // decides visibility. It stops being decorative here: a visitor must not be
  // offered an apply button for a role that closed last week.
  const open = deadline === null || deadline.getTime() > now.getTime();

  const summary = summarise(row.description);
  // Same text the Supabase-backed mapping classified on (title, department,
  // summary), so categories and skills stay comparable across both sources.
  const classifiable = `${row.title} ${row.department} ${summary}`;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    department: row.department,
    careerArea: DEFAULT_CAREER_AREA,
    location: row.location,
    workplaceType: WORKPLACE_LABELS[row.workplace_type],
    employmentType: EMPLOYMENT_LABELS[row.employment_type],
    summary,
    description: row.description,
    responsibilities: row.responsibilities ?? [],
    // Neon names this column `requirements`; the view-model calls the same
    // thing `qualifications`, which is what JobDetailView renders as
    // "Required qualifications".
    qualifications: row.requirements ?? [],
    // No preferred-qualifications column exists. Left undefined rather than
    // folded into the required list, which would publish a nice-to-have as a
    // hard requirement and put off candidates who would have applied.
    preferredQualifications: undefined,
    postedAt,
    status: open ? "open" : "closed",
    acceptingApplications: open,
    // 7 days, via the same helper the Supabase mapping used, so the NEW badge
    // keeps one definition.
    isNew: open && isNewListing(postedAt, now),
    // Nothing writes demo rows to Neon: the admin console is the only writer.
    isDemo: false,
    // Neon has no separate requisition record, so the job's own id is the
    // stable key. SaveJobButton stores this, hence it must not be the slug.
    requisitionId: row.id,
    referenceNumber: row.reference || row.id,
    closesAt: deadline?.toISOString(),
    company: COMPANY_NAME,
    experienceLevel: row.experience_level ?? undefined,
    // Every Neon job is applied to through Easy Apply on this site. There is no
    // external-URL column, so EXTERNAL is not reachable from this source.
    applicationType: "INTERNAL",
    salaryLabel: formatSalaryLabel(row),
    salaryMin: row.salary_min ?? undefined,
    salaryMax: row.salary_max ?? undefined,
    skills: skillsFor(classifiable),
    categories: categoriesFor(classifiable),
    // Deliberately false. lib/jobs/portal.ts defines Verified as a record a
    // person explicitly confirmed, and says being stored in the database is not
    // verification. Neon has no column holding that decision, so claiming it
    // would put a trust badge on a posting nobody vouched for. Add the column,
    // then flip this.
    verified: false,
    // Admin-entered perks now have a home on the detail page.
    benefits: row.benefits ?? [],
  };
}

/**
 * First paragraph of the description, trimmed to one line.
 *
 * Neon has no curated summary column, but list cards and the page description
 * both need a short line. An excerpt of copy the employer wrote is the only
 * honest source; the alternative (no summary at all) leaves every card bare.
 */
function summarise(description: string): string {
  const firstParagraph = description.trim().split(/\n\s*\n/)[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (firstParagraph.length <= SUMMARY_MAX_CHARS) {
    return firstParagraph;
  }

  const clipped = firstParagraph.slice(0, SUMMARY_MAX_CHARS);
  const lastSpace = clipped.lastIndexOf(" ");
  // Only break on a word boundary if one is near the end; a description with no
  // spaces in its first 220 characters would otherwise lose almost everything.
  const body = lastSpace > SUMMARY_MAX_CHARS * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return `${body.trimEnd()}…`;
}

/**
 * "$120,000–$160,000 / year", or undefined when no figure was published.
 *
 * Per year because the schema has no period column and salary_min/max are
 * annual integers; the Supabase-backed formatter defaulted the same way.
 */
function formatSalaryLabel(row: JobRow): string | undefined {
  const min = row.salary_min;
  const max = row.salary_max;
  if (min === null && max === null) {
    return undefined;
  }

  const currency = row.salary_currency?.trim() || "USD";
  const money = (value: number) => formatMoney(value, currency);

  if (min !== null && max !== null) {
    return `${money(min)}–${money(max)} / year`;
  }
  const only = min ?? max;
  return only === null ? undefined : `${money(only)} / year`;
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    // Intl throws RangeError on a code it does not recognise. salary_currency
    // is free TEXT in the schema, so a typo must not take the careers page
    // down over a formatting detail.
    return `${currency} ${value.toLocaleString("en-US")}`;
  }
}

/**
 * TIMESTAMPTZ arrives as a `Date` (see the note at the top of
 * lib/neon/types.ts), so this is mostly a null-to-undefined conversion. It
 * accepts a string anyway: these values reach `.toISOString()` on a page that
 * must not fail, and a driver or transport that handed back a string would
 * otherwise throw a TypeError at a visitor.
 */
function toDate(value: Date | string | null): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
