import "server-only";

import { getJobBySlug, searchPublicJobs, type Job } from "@/lib/jobs";
import type {
  PublicJobDetail,
  PublicJobSearch,
  PublicJobSource,
  PublicJobSummary,
} from "@/lib/assistant/tools";

/**
 * The assistant's view of jobs. It calls the exact functions /jobs and
 * /careers use (searchPublicJobs / getJobBySlug → recruiting repository →
 * isPubliclyOpen + includeOnPublicSite), so it cannot see a job those pages
 * would hide: demo (in production), unpublished, scheduled, expired or closed.
 */

function toSummary(job: Job): PublicJobSummary {
  const external = job.applicationType === "EXTERNAL" && Boolean(job.externalApplyUrl);
  return {
    slug: job.slug,
    title: job.title,
    company: job.company,
    location: job.location,
    workplaceType: job.workplaceType,
    employmentType: job.employmentType,
    experienceLevel: job.experienceLevel,
    salaryLabel: job.salaryLabel,
    skills: job.skills,
    postedAt: job.postedAt,
    viewHref: `/jobs/${job.slug}`,
    applyHref: external ? (job.externalApplyUrl as string) : `/jobs/${job.slug}/apply`,
    applyIsExternal: external,
  };
}

function isEligible(job: Job | undefined): job is Job {
  return Boolean(job && job.status === "open" && job.acceptingApplications);
}

export const publicJobSource: PublicJobSource = {
  async search(params: PublicJobSearch) {
    const base = {
      location: params.location,
      employment: params.employmentType,
      arrangement: params.workplaceType,
    };
    let result = await searchPublicJobs({ ...base, q: params.query });
    // Conversational queries ("Oracle integration") may not appear verbatim;
    // fall back to requiring every word, over the same eligible set.
    if (result.total === 0 && params.query && /\s/.test(params.query.trim())) {
      const words = params.query.toLowerCase().split(/\s+/).filter(Boolean);
      const all = await searchPublicJobs(base);
      const matched = all.jobs.filter((job) => {
        const text = [job.title, job.summary, job.description, job.location, ...job.skills]
          .join(" ")
          .toLowerCase();
        return words.every((word) => text.includes(word));
      });
      result = { ...all, jobs: matched, total: matched.length };
    }
    return { total: result.total, jobs: result.jobs.slice(0, params.limit).map(toSummary) };
  },

  async get(slug: string): Promise<PublicJobDetail | null> {
    const job = await getJobBySlug(slug);
    if (!isEligible(job)) return null;
    return {
      ...toSummary(job),
      summary: job.summary,
      description: job.description,
      responsibilities: job.responsibilities,
      qualifications: job.qualifications,
      preferredQualifications: job.preferredQualifications ?? [],
    };
  },
};
