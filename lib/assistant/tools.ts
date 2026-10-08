/**
 * The public assistant's ONLY capabilities. Each tool is read-only and returns
 * public data: eligible job postings (via the same repository + eligibility
 * rules as /jobs and /careers) or approved site copy. There is deliberately no
 * tool that can reach candidates, applications, documents, job intake, email,
 * or arbitrary database queries.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import {
  CAREER_TOPICS,
  COMPANY_TOPICS,
  getApplicationFacts,
  getCareerInformation,
  getCompanyInformation,
} from "@/lib/assistant/knowledge";

export const EMPLOYMENT_TYPES = ["Full Time", "Part Time", "Contract", "Temporary", "Internship"] as const;
export const WORKPLACE_TYPES = ["Remote", "Hybrid", "On-site"] as const;

/** Public fields of an eligible job, as shown on /jobs. Never anything private. */
export type PublicJobSummary = {
  slug: string;
  title: string;
  company: string;
  location: string;
  workplaceType: string;
  employmentType: string;
  experienceLevel?: string;
  salaryLabel?: string;
  skills: string[];
  postedAt: string;
  viewHref: string;
  /** /jobs/[slug]/apply for Easy Apply jobs; the vetted external URL otherwise. */
  applyHref: string;
  applyIsExternal: boolean;
};

export type PublicJobDetail = PublicJobSummary & {
  summary: string;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  preferredQualifications: string[];
};

export type PublicJobSearch = {
  query?: string;
  location?: string;
  employmentType?: (typeof EMPLOYMENT_TYPES)[number];
  workplaceType?: (typeof WORKPLACE_TYPES)[number];
  limit: number;
};

/** Read-only port onto the public jobs repository. */
export type PublicJobSource = {
  search(params: PublicJobSearch): Promise<{ total: number; jobs: PublicJobSummary[] }>;
  /** Returns only a currently eligible public job, otherwise null. */
  get(slug: string): Promise<PublicJobDetail | null>;
};

const SLUG = z.string().trim().min(1).max(200).regex(/^[a-z0-9][a-z0-9-]*$/);

const searchInput = z
  .object({
    query: z.string().trim().max(120).nullable(),
    location: z.string().trim().max(80).nullable(),
    employment_type: z.enum(EMPLOYMENT_TYPES).nullable(),
    workplace_type: z.enum(WORKPLACE_TYPES).nullable(),
  })
  .strict();
const jobInput = z.object({ slug: SLUG }).strict();
const companyInput = z.object({ topic: z.enum(COMPANY_TOPICS) }).strict();
const careerInput = z.object({ topic: z.enum(CAREER_TOPICS) }).strict();
const guidanceInput = z.object({ slug: SLUG.nullable() }).strict();

const nullableString = { type: ["string", "null"] } as const;

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_public_jobs",
    description:
      "Search Consult America's CURRENT public job openings (the same list shown on /jobs). Use for any question about open roles, skills, locations, remote/hybrid work or employment type. Pass a single short keyword in `query` (e.g. \"Oracle\", \"OIC\", \"data\"); use null for filters the visitor did not mention. Returns the total and up to 6 jobs.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        query: { ...nullableString, description: "One keyword or short phrase, or null." },
        location: { ...nullableString, description: "City, state or region, or null." },
        employment_type: { type: ["string", "null"], enum: [...EMPLOYMENT_TYPES, null] },
        workplace_type: { type: ["string", "null"], enum: [...WORKPLACE_TYPES, null] },
      },
      required: ["query", "location", "employment_type", "workplace_type"],
      additionalProperties: false,
    },
  },
  {
    name: "get_public_job",
    description:
      "Get the full public posting for one current job by its slug (from search results or the page context). Returns null fields when something is not stated in the posting.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "get_company_information",
    description: "Approved information about Consult America: what it does, capabilities, industries, how it works, contact.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { topic: { type: "string", enum: [...COMPANY_TOPICS] } },
      required: ["topic"],
      additionalProperties: false,
    },
  },
  {
    name: "get_career_information",
    description: "Approved information about careers at Consult America: working here, areas of work, the hiring process, where to find roles.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { topic: { type: "string", enum: [...CAREER_TOPICS] } },
      required: ["topic"],
      additionalProperties: false,
    },
  },
  {
    name: "get_application_guidance",
    description:
      "How to apply: what the Easy Apply form requires and the link to apply. Pass the job slug when the visitor is asking about a specific job, otherwise null.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { slug: { ...nullableString } },
      required: ["slug"],
      additionalProperties: false,
    },
  },
];

export type ToolOutcome = {
  /** JSON string returned to the model as the tool_result. */
  content: string;
  isError: boolean;
  /** Server-side job data the UI may render as cards (never model-authored). */
  jobs: PublicJobSummary[];
  links: { label: string; href: string }[];
  grounding?: "jobs" | "company" | "careers" | "application";
  /** Set when a jobs search succeeded and found nothing. */
  zeroOpenings?: boolean;
  /** Set when the jobs repository failed. */
  jobsUnavailable?: boolean;
};

const fail = (message: string, extra: Partial<ToolOutcome> = {}): ToolOutcome => ({
  content: JSON.stringify({ error: message }),
  isError: true,
  jobs: [],
  links: [],
  ...extra,
});

const MAX_RESULTS = 6;

function compact(job: PublicJobSummary) {
  return {
    slug: job.slug,
    title: job.title,
    company: job.company,
    location: job.location || null,
    workplace_type: job.workplaceType || null,
    employment_type: job.employmentType || null,
    experience_level: job.experienceLevel ?? null,
    salary: job.salaryLabel ?? null,
    skills: job.skills.slice(0, 8),
    posted_at: job.postedAt,
    view_url: job.viewHref,
    apply_url: job.applyHref,
  };
}

export async function executeAssistantTool(
  name: string,
  rawInput: unknown,
  deps: { jobs: PublicJobSource },
): Promise<ToolOutcome> {
  switch (name) {
    case "search_public_jobs": {
      const parsed = searchInput.safeParse(rawInput);
      if (!parsed.success) return fail("Invalid search arguments.");
      const { query, location, employment_type, workplace_type } = parsed.data;
      try {
        const result = await deps.jobs.search({
          query: query || undefined,
          location: location || undefined,
          employmentType: employment_type ?? undefined,
          workplaceType: workplace_type ?? undefined,
          limit: MAX_RESULTS,
        });
        const zero = result.total === 0;
        return {
          content: JSON.stringify({
            total_matching: result.total,
            jobs: result.jobs.map(compact),
            ...(zero
              ? {
                  note: query || location || employment_type || workplace_type
                    ? "No current public openings match these filters."
                    : "There are currently no public openings.",
                }
              : {}),
          }),
          isError: false,
          jobs: result.jobs,
          links: [{ label: "View all jobs", href: "/jobs" }],
          grounding: "jobs",
          zeroOpenings: zero,
        };
      } catch {
        return fail("Job listings are temporarily unavailable.", {
          jobsUnavailable: true,
          links: [{ label: "Browse Jobs", href: "/jobs" }],
        });
      }
    }

    case "get_public_job": {
      const parsed = jobInput.safeParse(rawInput);
      if (!parsed.success) return fail("Invalid job reference.");
      try {
        const job = await deps.jobs.get(parsed.data.slug);
        if (!job) {
          return {
            content: JSON.stringify({ found: false, note: "This job is not a current public opening." }),
            isError: false,
            jobs: [],
            links: [{ label: "View current jobs", href: "/jobs" }],
            grounding: "jobs",
          };
        }
        return {
          content: JSON.stringify({
            found: true,
            job: {
              ...compact(job),
              summary: job.summary,
              description: job.description.slice(0, 4000),
              responsibilities: job.responsibilities,
              qualifications: job.qualifications,
              preferred_qualifications: job.preferredQualifications,
            },
          }),
          isError: false,
          jobs: [job],
          links: [],
          grounding: "jobs",
        };
      } catch {
        return fail("Job details are temporarily unavailable.", {
          jobsUnavailable: true,
          links: [{ label: "Browse Jobs", href: "/jobs" }],
        });
      }
    }

    case "get_company_information": {
      const parsed = companyInput.safeParse(rawInput);
      if (!parsed.success) return fail("Unknown topic.");
      const answer = getCompanyInformation(parsed.data.topic);
      return { content: JSON.stringify(answer), isError: false, jobs: [], links: answer.links, grounding: "company" };
    }

    case "get_career_information": {
      const parsed = careerInput.safeParse(rawInput);
      if (!parsed.success) return fail("Unknown topic.");
      const answer = getCareerInformation(parsed.data.topic);
      return { content: JSON.stringify(answer), isError: false, jobs: [], links: answer.links, grounding: "careers" };
    }

    case "get_application_guidance": {
      const parsed = guidanceInput.safeParse(rawInput);
      if (!parsed.success) return fail("Invalid job reference.");
      const facts = getApplicationFacts();
      if (!parsed.data.slug) {
        return {
          content: JSON.stringify({ steps: facts, apply_from: "Choose a role on the Jobs page, then use Easy Apply." }),
          isError: false,
          jobs: [],
          links: [{ label: "View open roles", href: "/jobs" }],
          grounding: "application",
        };
      }
      try {
        const job = await deps.jobs.get(parsed.data.slug);
        if (!job) {
          return {
            content: JSON.stringify({ found: false, note: "This job is not accepting applications.", steps: facts }),
            isError: false,
            jobs: [],
            links: [{ label: "View current jobs", href: "/jobs" }],
            grounding: "application",
          };
        }
        return {
          content: JSON.stringify(
            job.applyIsExternal
              ? { job: job.title, external: true, apply_url: job.applyHref, note: "This role is applied for on the employer's own site." }
              : {
                  job: job.title,
                  external: false,
                  easy_apply_url: job.applyHref,
                  detailed_apply_url: `/jobs/${job.slug}/apply/detailed`,
                  steps: facts,
                },
          ),
          isError: false,
          jobs: [job],
          links: job.applyIsExternal
            ? [{ label: "Apply on employer site", href: job.applyHref }]
            : [
                { label: "Easy Apply", href: job.applyHref },
                { label: "Detailed application", href: `/jobs/${job.slug}/apply/detailed` },
              ],
          grounding: "application",
        };
      } catch {
        return fail("Application details are temporarily unavailable.", {
          jobsUnavailable: true,
          links: [{ label: "Browse Jobs", href: "/jobs" }],
        });
      }
    }

    default:
      return fail("Unknown tool.");
  }
}
