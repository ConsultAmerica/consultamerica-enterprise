export type PortalJob = {
  title: string;
  company: string;
  department: string;
  location: string;
  workplaceType: string;
  employmentType: string;
  summary: string;
  description: string;
  id: string;
  requisitionId: string;
  postedAt: string;
  acceptingApplications: boolean;
  experienceLevel?: string;
  applicationType: "INTERNAL" | "EXTERNAL";
  skills: string[];
  categories: { id: string; label: string }[];
  salaryMin?: number;
  salaryMax?: number;
  verified?: boolean;
  isDemo?: boolean;
};

/**
 * A job is Verified only when staff set `verified` on a non-demo record.
 * That means a direct employer posting or an approved ATS record that a
 * person explicitly confirmed. Being stored in the database is not verification.
 */
export function isVerifiedJob(job: { verified?: boolean; isDemo?: boolean }): boolean {
  return job.verified === true && job.isDemo !== true;
}

export function safeExternalApplyUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export const PORTAL_CATEGORIES = [
  { id: "ai-ml", label: "AI / Machine Learning", test: /ai|machine learning|\bllm\b|gen ai/i },
  { id: "oracle", label: "Oracle / ERP", test: /oracle|fusion|erp/i },
  { id: "software", label: "Software Engineering", test: /software|full stack|frontend|backend|engineer/i },
  { id: "data", label: "Data & Analytics", test: /data|analytics|warehouse/i },
  { id: "cloud", label: "Cloud / DevOps", test: /cloud|devops|kubernetes|platform engineer/i },
  { id: "security", label: "Cybersecurity", test: /cyber|security engineer/i },
  { id: "pm", label: "Project / Program Management", test: /project|program manager|pmo/i },
  { id: "ba", label: "Business Analysis", test: /business analyst|business analysis/i },
  { id: "qa", label: "QA / Testing", test: /\bqa\b|test engineer|quality/i },
  { id: "crm", label: "CRM", test: /\bcrm\b|clientflow/i },
  { id: "hr", label: "HR / HCM", test: /\bhr\b|hcm|people operations/i },
  { id: "finance", label: "Finance / Accounting", test: /finance|account/i },
  { id: "sales", label: "Sales / Business Development", test: /sales|business development/i },
  { id: "operations", label: "Operations / Administration", test: /operations|administration/i },
] as const;

export type PortalCategoryId = (typeof PORTAL_CATEGORIES)[number]["id"];

const SKILL_TERMS = [
  "Oracle",
  "Python",
  "AI/ML",
  "LLM",
  "Gen AI",
  "Data",
  "API",
  "Frontend",
  "Backend",
  "FastAPI",
  "RAG",
] as const;

export const DATE_WINDOWS = [
  { id: "24h", label: "Past 24 hours", ms: 24 * 60 * 60 * 1000 },
  { id: "3d", label: "Past 3 days", ms: 3 * 24 * 60 * 60 * 1000 },
  { id: "7d", label: "Past 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "14d", label: "Past 14 days", ms: 14 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "Past 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

export const EXPERIENCE_LEVELS = [
  "Internship",
  "Entry Level",
  "Associate",
  "Mid Level",
  "Senior",
  "Lead",
  "Manager",
  "Director",
] as const;

export type PortalSearch = {
  q?: string;
  location?: string;
  category?: string;
  date?: string;
  experience?: string;
  employment?: string;
  arrangement?: string;
  easy?: boolean;
  company?: string;
  verified?: boolean;
  skill?: string;
  sort?: "relevant" | "newest" | "oldest" | "salary";
  page?: number;
  selected?: string;
};

export function categoriesFor(text: string): { id: string; label: string }[] {
  return PORTAL_CATEGORIES.filter((category) => category.test.test(text)).map((category) => ({
    id: category.id,
    label: category.label,
  }));
}

export function skillsFor(text: string, explicit: string[] = []): string[] {
  const found = SKILL_TERMS.filter((term) => text.toLowerCase().includes(term.toLowerCase()));
  return [...new Set([...explicit, ...found])].slice(0, 4);
}

export function formatSalary(job: {
  salaryMin?: number;
  salaryMax?: number;
  salaryPeriod?: "YEAR" | "HOUR";
}): string | undefined {
  if (job.salaryMin == null && job.salaryMax == null) return undefined;
  const period = job.salaryPeriod === "HOUR" ? "hour" : "year";
  const money = (value: number) =>
    job.salaryPeriod === "HOUR"
      ? `$${value}`
      : `$${value.toLocaleString("en-US")}`;
  if (job.salaryMin != null && job.salaryMax != null) {
    return `${money(job.salaryMin)}–${money(job.salaryMax)} / ${period}`;
  }
  const only = job.salaryMin ?? job.salaryMax;
  return only == null ? undefined : `${money(only)} / ${period}`;
}

function postedMs(job: PortalJob): number {
  return new Date(job.postedAt).getTime();
}

function matchesBase(job: PortalJob, search: PortalSearch, now: number): boolean {
  const query = search.q?.trim().toLowerCase();
  if (query) {
    const haystack = [
      job.title,
      job.company,
      job.department,
      job.location,
      job.summary,
      job.description,
      job.id,
      job.requisitionId,
      ...job.skills,
      ...job.categories.map((category) => category.label),
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  if (search.location?.trim()) {
    const needle = search.location.trim().toLowerCase();
    const place = `${job.location} ${job.workplaceType}`.toLowerCase();
    if (!place.includes(needle)) return false;
  }
  if (search.category && search.category !== "all") {
    if (!job.categories.some((category) => category.id === search.category)) return false;
  }
  if (search.date) {
    const window = DATE_WINDOWS.find((item) => item.id === search.date);
    if (window && now - postedMs(job) > window.ms) return false;
  }
  if (search.experience && job.experienceLevel !== search.experience) return false;
  if (search.employment && job.employmentType !== search.employment) return false;
  if (search.arrangement && job.workplaceType !== search.arrangement) return false;
  if (search.easy && job.applicationType !== "INTERNAL") return false;
  if (search.company && job.company !== search.company) return false;
  if (search.verified && !isVerifiedJob(job)) return false;
  if (search.skill && !job.skills.some((skill) => skill.toLowerCase() === search.skill?.toLowerCase())) {
    return false;
  }
  return true;
}

function relevance(job: PortalJob, query: string): number {
  const q = query.toLowerCase();
  let score = 0;
  if (job.title.toLowerCase().includes(q)) score += 5;
  if (job.skills.some((skill) => skill.toLowerCase().includes(q))) score += 3;
  if (job.summary.toLowerCase().includes(q)) score += 1;
  return score;
}

export function queryPortalJobs(
  jobs: PortalJob[],
  search: PortalSearch,
  now: Date = new Date(),
  pageSize = 20,
) {
  const instant = now.getTime();
  const matched = jobs.filter((job) => job.acceptingApplications && matchesBase(job, search, instant));
  const sort = search.sort ?? (search.q?.trim() ? "relevant" : "newest");
  const ordered = [...matched].sort((a, b) => {
    if (sort === "oldest") return postedMs(a) - postedMs(b);
    if (sort === "salary") return (b.salaryMax ?? b.salaryMin ?? 0) - (a.salaryMax ?? a.salaryMin ?? 0);
    if (sort === "relevant" && search.q?.trim()) {
      const delta = relevance(b, search.q.trim()) - relevance(a, search.q.trim());
      if (delta !== 0) return delta;
    }
    return postedMs(b) - postedMs(a);
  });
  const page = Math.max(1, search.page ?? 1);
  const start = (page - 1) * pageSize;
  return {
    jobs: ordered.slice(start, start + pageSize),
    total: ordered.length,
    page,
    pageCount: Math.max(1, Math.ceil(ordered.length / pageSize)),
    sort,
  };
}

export function portalFacets(jobs: PortalJob[], search: PortalSearch, now: Date = new Date()) {
  const instant = now.getTime();
  const pool = (omit: Partial<PortalSearch>) =>
    jobs.filter((job) =>
      job.acceptingApplications &&
      matchesBase(job, { ...search, ...omit, page: undefined, selected: undefined }, instant),
    );
  const base = pool({ category: undefined, skill: undefined });
  const categories = PORTAL_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    count: base.filter((job) => job.categories.some((item) => item.id === category.id)).length,
  })).filter((category) => category.count > 0);
  const countOf = (rows: PortalJob[], pick: (job: PortalJob) => string | undefined) => {
    const counts = new Map<string, number>();
    for (const job of rows) {
      const value = pick(job);
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value));
  };
  const companies = countOf(pool({ company: undefined, category: undefined }), (job) => job.company);
  const skills = SKILL_TERMS.map((skill) => ({
    value: skill,
    count: base.filter((job) => job.skills.some((item) => item.toLowerCase() === skill.toLowerCase())).length,
  })).filter((skill) => skill.count > 0);
  const salaryCount = base.filter((job) => job.salaryMin != null || job.salaryMax != null).length;
  return {
    total: base.length,
    categories,
    experience: countOf(pool({ experience: undefined, category: undefined }), (job) => job.experienceLevel).filter((item) =>
      EXPERIENCE_LEVELS.includes(item.value as (typeof EXPERIENCE_LEVELS)[number]),
    ),
    employment: countOf(pool({ employment: undefined, category: undefined }), (job) => job.employmentType),
    arrangement: countOf(pool({ arrangement: undefined, category: undefined }), (job) => job.workplaceType),
    companies,
    showCompany: companies.length > 1,
    easyApply: base.filter((job) => job.applicationType === "INTERNAL").length,
    verified: base.filter((job) => isVerifiedJob(job)).length,
    skills,
    salarySort: salaryCount >= 5,
  };
}

export function jobsHref(search: PortalSearch, patch: Partial<PortalSearch> = {}): string {
  const next = { ...search, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.location) params.set("location", next.location);
  if (next.category && next.category !== "all") params.set("category", next.category);
  if (next.date) params.set("date", next.date);
  if (next.experience) params.set("experience", next.experience);
  if (next.employment) params.set("employment", next.employment);
  if (next.arrangement) params.set("arrangement", next.arrangement);
  if (next.easy) params.set("easy", "1");
  if (next.company) params.set("company", next.company);
  if (next.verified) params.set("verified", "1");
  if (next.skill) params.set("skill", next.skill);
  const defaultSort = next.q ? "relevant" : "newest";
  if (next.sort && next.sort !== defaultSort) params.set("sort", next.sort);
  if (next.page && next.page > 1) params.set("page", String(next.page));
  if (next.selected) params.set("selected", next.selected);
  const text = params.toString();
  return text ? `/jobs?${text}` : "/jobs";
}
