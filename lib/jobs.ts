/**
 * Public careers Job view-model.
 * Backed by `Job` (types/recruiting.ts), aliased to `JobPosting` here since
 * this file's own `Job` view-model export would otherwise collide with it.
 *
 * Server-only: data access + recruiting repository. Client UI must import
 * types/formatters from `@/lib/jobs/public-model` instead.
 */

import "server-only";

import {
  employmentTypeLabels,
  workplaceTypeLabels,
} from "@/types/organization";
import type { Job as JobPosting } from "@/types/recruiting";
import { careerAreaLabels as recruitingCareerLabels } from "@/data/jobs";
import {
  getPostingBySlugAny,
  listPublishedPostings,
} from "@/lib/recruiting";
import { isNewListing, isPubliclyOpen } from "@/lib/jobs/eligibility";
import {
  categoriesFor,
  formatSalary,
  queryPortalJobs,
  safeExternalApplyUrl,
  skillsFor,
  type PortalSearch,
} from "@/lib/jobs/portal";
import { relatedJobs } from "@/lib/jobs/detail";
import type { Job, JobFilters } from "@/lib/jobs/public-model";

export type { Job, JobFilters } from "@/lib/jobs/public-model";
export { formatPostedDate } from "@/lib/jobs/public-model";
export { careerAreaLabels } from "@/data/jobs";

function toPublicJob(posting: JobPosting): Job {
  const open = isPubliclyOpen(posting);
  const postedAt = posting.publishedAt ?? posting.createdAt;
  const applicationType = posting.applicationType === "EXTERNAL" ? "EXTERNAL" : "INTERNAL";
  const externalApplyUrl =
    applicationType === "EXTERNAL" ? safeExternalApplyUrl(posting.externalApplyUrl) ?? undefined : undefined;
  const text = `${posting.title} ${posting.departmentName} ${posting.summary}`;
  const employmentType = employmentTypeLabels[posting.employmentType] as Job["employmentType"];
  return {
    id: posting.id,
    slug: posting.slug,
    title: posting.title,
    department: posting.departmentName,
    careerArea: posting.careerArea,
    location: posting.locationName,
    workplaceType: workplaceTypeLabels[posting.workplaceType] as Job["workplaceType"],
    employmentType,
    summary: posting.summary,
    description: posting.description,
    responsibilities: posting.responsibilities,
    qualifications: posting.qualifications,
    preferredQualifications: posting.preferredQualifications,
    postedAt,
    status: open ? "open" : "closed",
    acceptingApplications: open && (applicationType === "INTERNAL" || Boolean(externalApplyUrl)),
    isNew: open && isNewListing(postedAt),
    isDemo: posting.isDemo,
    requisitionId: posting.requisitionId,
    referenceNumber: posting.requisitionNumber || posting.requisitionId || posting.id,
    closesAt: posting.applicationDeadline ?? posting.expiresAt,
    company: posting.companyName || "Consult America",
    companySummary: posting.companySummary,
    experienceLevel: posting.experienceLevel,
    applicationType: applicationType === "EXTERNAL" && externalApplyUrl ? "EXTERNAL" : "INTERNAL",
    externalApplyUrl,
    salaryLabel: formatSalary(posting),
    salaryMin: posting.salaryMin,
    salaryMax: posting.salaryMax,
    skills: skillsFor(text, posting.skills),
    categories: categoriesFor(text),
    verified: posting.verified === true && !posting.isDemo,
  };
}

export const JOBS_PAGE_SIZE = 20;

export type JobSearch = PortalSearch & {
  department?: string;
  arrangement?: string;
  type?: string;
};

export function parsePortalSearch(params: Record<string, string | string[] | undefined>): PortalSearch {
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const sort = one(params.sort);
  return {
    q: one(params.q) || undefined,
    location: one(params.location) || undefined,
    category: one(params.category) || one(params.department) || undefined,
    date: one(params.date) || undefined,
    experience: one(params.experience) || undefined,
    employment: one(params.employment) || one(params.type) || undefined,
    arrangement: one(params.arrangement) || undefined,
    easy: one(params.easy) === "1",
    company: one(params.company) || undefined,
    verified: one(params.verified) === "1",
    skill: one(params.skill) || undefined,
    sort: sort === "oldest" || sort === "relevant" || sort === "salary" || sort === "newest" ? sort : undefined,
    page: Number(one(params.page) || "1") || 1,
    selected: one(params.selected) || undefined,
  };
}

export async function searchPublicJobs(search: JobSearch): Promise<{
  jobs: Job[];
  total: number;
  page: number;
  pageCount: number;
  sort: string;
}> {
  const portalSearch: PortalSearch = {
    ...search,
    category: search.category || (search.department && search.department !== "all" ? search.department : undefined),
    arrangement: search.arrangement && search.arrangement !== "all" ? search.arrangement : undefined,
    employment: search.employment || (search.type && search.type !== "all" ? search.type : undefined),
    sort: search.sort === "oldest" ? "oldest" : search.sort,
  };
  const result = queryPortalJobs(await getOpenJobs(), portalSearch, new Date(), JOBS_PAGE_SIZE);
  return { ...result, jobs: result.jobs as Job[] };
}
const SAMPLE_POSTING_COPY = "sample position for development and design review";

function includeOnPublicSite(posting: { isDemo?: boolean; description?: string }): boolean {
  // Sample catalog entries are for local design review.
  // Production must not publish them, including when they were copied into
  // the database with the same development description.
  if (process.env.NODE_ENV !== "production") return true;
  if (posting.isDemo) return false;
  return !posting.description?.includes(SAMPLE_POSTING_COPY);
}

export async function getOpenJobs(): Promise<Job[]> {
  const postings = await listPublishedPostings();
  return postings.filter(includeOnPublicSite).map(toPublicJob);
}

export async function getJobBySlug(slug: string): Promise<Job | undefined> {
  const posting = await getPostingBySlugAny(slug);
  if (!posting || !includeOnPublicSite(posting)) return undefined;
  return toPublicJob(posting);
}

/** Up to `limit` other open roles related to `job` (same category, then department). */
export async function getRelatedJobs(job: Job, limit = 3): Promise<Job[]> {
  return relatedJobs(job, await getOpenJobs(), limit);
}

export async function getAllJobSlugs(): Promise<string[]> {
  const jobs = await getOpenJobs();
  return jobs.map((job) => job.slug);
}

export function filterJobs(allJobs: Job[], filters: JobFilters): Job[] {
  const query = filters.query?.trim().toLowerCase();

  return allJobs.filter((job) => {
    if (filters.careerArea && filters.careerArea !== "all") {
      if (filters.careerArea === "experienced-professionals") {
        if (job.careerArea === "early-careers") return false;
      } else if (job.careerArea !== filters.careerArea) {
        return false;
      }
    }

    if (filters.location && filters.location !== "all") {
      const needle = filters.location.trim().toLowerCase();
      const haystack = `${job.location} ${job.workplaceType}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    if (filters.workplaceType && filters.workplaceType !== "all") {
      if (job.workplaceType !== filters.workplaceType) return false;
    }

    if (filters.employmentType && filters.employmentType !== "all") {
      if (job.employmentType !== filters.employmentType) return false;
    }

    if (query) {
      const haystack = [
        job.title,
        job.id,
        job.requisitionId,
        job.department,
        job.summary,
        job.description,
        recruitingCareerLabels[job.careerArea],
        job.location,
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

export function getJobFilterOptions(allJobs: Job[]) {
  return {
    locations: [...new Set(allJobs.map((job) => job.location))].sort(),
    careerAreas: Object.entries(recruitingCareerLabels).map(
      ([value, label]) => ({
        value,
        label,
      }),
    ),
    workplaceTypes: [...new Set(allJobs.map((job) => job.workplaceType))],
    employmentTypes: [...new Set(allJobs.map((job) => job.employmentType))],
  };
}
