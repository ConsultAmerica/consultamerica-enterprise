export type CareerArea =
  | "experienced-professionals"
  | "technology-oracle"
  | "ai-data"
  | "consulting"
  | "early-careers";

export const careerAreaLabels: Record<CareerArea, string> = {
  "experienced-professionals": "Experienced Professionals",
  "technology-oracle": "Technology & Oracle Careers",
  "ai-data": "AI & Data Careers",
  consulting: "Consulting Opportunities",
  "early-careers": "Early Careers",
};

/**
 * @deprecated Public job listings are served from JobPosting via lib/jobs.ts
 * and data/recruiting/seed.ts (Phase 2A). Kept for career-area labels only.
 */
