import type { Job } from "@/types/recruiting";
import type { EmploymentType, WorkplaceType } from "@/types/organization";
import type { CareerArea } from "@/types/recruiting";

/**
 * Development and staging catalog only.
 * Every record is isDemo and includes the sample-position sentence, so
 * production listing excludes them even if NODE_ENV is misread.
 * These are not production openings.
 */
const SAMPLE = "This is a sample position for development and design review.";

type Spec = {
  slug: string;
  title: string;
  category: string;
  location: string;
  workplace: WorkplaceType;
  employment: EmploymentType;
  experience: string;
  daysAgo: number;
  status?: Job["status"];
  external?: string;
  company?: string;
  salary?: [number, number, "YEAR" | "HOUR"];
  skills?: string[];
};

const specs: Spec[] = [
  { slug: "stg-oracle-fusion-financials", title: "Senior Oracle Fusion Financials Consultant", category: "Oracle", location: "Ashburn, VA", workplace: "HYBRID", employment: "FULL_TIME", experience: "Senior", daysAgo: 2, salary: [140000, 175000, "YEAR"], skills: ["Oracle"] },
  { slug: "stg-oracle-procurement", title: "Oracle Procurement Consultant", category: "Oracle", location: "Hagerstown, MD", workplace: "ONSITE", employment: "FULL_TIME", experience: "Mid Level", daysAgo: 6, skills: ["Oracle"] },
  { slug: "stg-oracle-scm", title: "Oracle SCM Consultant", category: "Oracle", location: "Remote", workplace: "REMOTE", employment: "CONTRACT", experience: "Senior", daysAgo: 1, salary: [75, 95, "HOUR"], skills: ["Oracle"] },
  { slug: "stg-oracle-hcm", title: "Oracle HCM Consultant", category: "HR", location: "Washington, DC", workplace: "HYBRID", employment: "FULL_TIME", experience: "Associate", daysAgo: 12, skills: ["Oracle"] },
  { slug: "stg-oracle-integration", title: "Oracle Integration Developer", category: "Oracle", location: "Baltimore, MD", workplace: "HYBRID", employment: "FULL_TIME", experience: "Mid Level", daysAgo: 0.3, skills: ["Oracle", "API"] },
  { slug: "stg-oracle-reporting", title: "Oracle Reporting Analyst", category: "Oracle", location: "Ashburn, VA", workplace: "ONSITE", employment: "FULL_TIME", experience: "Entry Level", daysAgo: 20 },
  { slug: "stg-ai-engineer", title: "AI Engineer", category: "AI", location: "Remote", workplace: "REMOTE", employment: "FULL_TIME", experience: "Senior", daysAgo: 0.5, salary: [150000, 185000, "YEAR"], skills: ["AI/ML", "Python"] },
  { slug: "stg-ml-engineer", title: "Machine Learning Engineer", category: "AI", location: "Arlington, VA", workplace: "HYBRID", employment: "FULL_TIME", experience: "Mid Level", daysAgo: 4, skills: ["AI/ML", "Python"] },
  { slug: "stg-llm-app", title: "LLM Application Engineer", category: "AI", location: "Remote", workplace: "REMOTE", employment: "CONTRACT", experience: "Senior", daysAgo: 8, skills: ["LLM", "Python", "RAG"] },
  { slug: "stg-genai", title: "Gen AI Solutions Consultant", category: "AI", location: "Washington, DC", workplace: "HYBRID", employment: "FULL_TIME", experience: "Lead", daysAgo: 15, skills: ["Gen AI"] },
  { slug: "stg-software-fullstack", title: "Full Stack Software Engineer", category: "Software", location: "Ashburn, VA", workplace: "HYBRID", employment: "FULL_TIME", experience: "Mid Level", daysAgo: 3, salary: [120000, 150000, "YEAR"], skills: ["Frontend", "Backend", "API"] },
  { slug: "stg-frontend", title: "Frontend Engineer", category: "Software", location: "Remote", workplace: "REMOTE", employment: "FULL_TIME", experience: "Associate", daysAgo: 9, skills: ["Frontend"] },
  { slug: "stg-backend", title: "Backend Engineer", category: "Software", location: "Hagerstown, MD", workplace: "ONSITE", employment: "FULL_TIME", experience: "Senior", daysAgo: 11, skills: ["Backend", "Python", "FastAPI"] },
  { slug: "stg-api", title: "API Engineer", category: "Software", location: "Baltimore, MD", workplace: "HYBRID", employment: "CONTRACT", experience: "Mid Level", daysAgo: 0.8, skills: ["API"] },
  { slug: "stg-data-engineer", title: "Data Engineer", category: "Data", location: "Ashburn, VA", workplace: "HYBRID", employment: "FULL_TIME", experience: "Senior", daysAgo: 5, salary: [130000, 160000, "YEAR"], skills: ["Data", "Python"] },
  { slug: "stg-analytics", title: "Analytics Consultant", category: "Data", location: "Washington, DC", workplace: "HYBRID", employment: "FULL_TIME", experience: "Associate", daysAgo: 18 },
  { slug: "stg-data-analyst", title: "Data Analyst", category: "Data", location: "Remote", workplace: "REMOTE", employment: "FULL_TIME", experience: "Entry Level", daysAgo: 2, skills: ["Data"] },
  { slug: "stg-warehouse", title: "Data Warehouse Engineer", category: "Data", location: "Arlington, VA", workplace: "ONSITE", employment: "CONTRACT", experience: "Senior", daysAgo: 25, skills: ["Data"] },
  { slug: "stg-cloud", title: "Cloud Engineer", category: "Cloud", location: "Ashburn, VA", workplace: "HYBRID", employment: "FULL_TIME", experience: "Mid Level", daysAgo: 7, skills: ["API"] },
  { slug: "stg-devops", title: "DevOps Engineer", category: "Cloud", location: "Remote", workplace: "REMOTE", employment: "FULL_TIME", experience: "Senior", daysAgo: 1.2 },
  { slug: "stg-platform", title: "Platform Engineer", category: "Cloud", location: "Baltimore, MD", workplace: "HYBRID", employment: "CONTRACT", experience: "Lead", daysAgo: 14 },
  { slug: "stg-security", title: "Cybersecurity Analyst", category: "Security", location: "Ashburn, VA", workplace: "ONSITE", employment: "FULL_TIME", experience: "Associate", daysAgo: 6 },
  { slug: "stg-security-eng", title: "Security Engineer", category: "Security", location: "Washington, DC", workplace: "HYBRID", employment: "FULL_TIME", experience: "Senior", daysAgo: 21 },
  { slug: "stg-pm", title: "Project Manager", category: "Delivery", location: "Hagerstown, MD", workplace: "HYBRID", employment: "FULL_TIME", experience: "Manager", daysAgo: 4, salary: [125000, 145000, "YEAR"] },
  { slug: "stg-program", title: "Program Manager", category: "Delivery", location: "Ashburn, VA", workplace: "ONSITE", employment: "FULL_TIME", experience: "Director", daysAgo: 10 },
  { slug: "stg-pmo", title: "PMO Analyst", category: "Delivery", location: "Remote", workplace: "REMOTE", employment: "CONTRACT", experience: "Associate", daysAgo: 0.4 },
  { slug: "stg-ba", title: "Business Analyst", category: "Consulting", location: "Baltimore, MD", workplace: "HYBRID", employment: "FULL_TIME", experience: "Mid Level", daysAgo: 8 },
  { slug: "stg-ba-senior", title: "Senior Business Analyst", category: "Consulting", location: "Washington, DC", workplace: "HYBRID", employment: "FULL_TIME", experience: "Senior", daysAgo: 16 },
  { slug: "stg-qa", title: "QA Test Engineer", category: "Quality", location: "Ashburn, VA", workplace: "ONSITE", employment: "FULL_TIME", experience: "Mid Level", daysAgo: 3 },
  { slug: "stg-qa-lead", title: "QA Lead", category: "Quality", location: "Remote", workplace: "REMOTE", employment: "CONTRACT", experience: "Lead", daysAgo: 13 },
  { slug: "stg-crm", title: "CRM Consultant", category: "CRM", location: "Hagerstown, MD", workplace: "HYBRID", employment: "FULL_TIME", experience: "Associate", daysAgo: 9 },
  { slug: "stg-crm-admin", title: "CRM Administrator", category: "CRM", location: "Ashburn, VA", workplace: "ONSITE", employment: "FULL_TIME", experience: "Entry Level", daysAgo: 22 },
  { slug: "stg-hr", title: "HR Operations Specialist", category: "People", location: "Hagerstown, MD", workplace: "ONSITE", employment: "FULL_TIME", experience: "Associate", daysAgo: 5 },
  { slug: "stg-hcm", title: "HCM Analyst", category: "People", location: "Baltimore, MD", workplace: "HYBRID", employment: "FULL_TIME", experience: "Mid Level", daysAgo: 19 },
  { slug: "stg-finance", title: "Finance Systems Analyst", category: "Finance", location: "Ashburn, VA", workplace: "HYBRID", employment: "FULL_TIME", experience: "Mid Level", daysAgo: 2.5, salary: [95000, 120000, "YEAR"] },
  { slug: "stg-accounting", title: "Accounting Consultant", category: "Finance", location: "Washington, DC", workplace: "ONSITE", employment: "CONTRACT", experience: "Senior", daysAgo: 11 },
  { slug: "stg-sales", title: "Business Development Associate", category: "Growth", location: "Arlington, VA", workplace: "HYBRID", employment: "FULL_TIME", experience: "Entry Level", daysAgo: 1 },
  { slug: "stg-sales-lead", title: "Sales Consultant", category: "Growth", location: "Remote", workplace: "REMOTE", employment: "FULL_TIME", experience: "Senior", daysAgo: 27 },
  { slug: "stg-ops", title: "Operations Coordinator", category: "Operations", location: "Hagerstown, MD", workplace: "ONSITE", employment: "FULL_TIME", experience: "Associate", daysAgo: 6 },
  { slug: "stg-admin", title: "Administration Specialist", category: "Operations", location: "Ashburn, VA", workplace: "HYBRID", employment: "PART_TIME", experience: "Entry Level", daysAgo: 0.6 },
  { slug: "stg-intern-oracle", title: "Oracle Internship", category: "Early career", location: "Ashburn, VA", workplace: "ONSITE", employment: "FULL_TIME", experience: "Internship", daysAgo: 3 },
  { slug: "stg-intern-data", title: "Data Internship", category: "Early career", location: "Remote", workplace: "REMOTE", employment: "FULL_TIME", experience: "Internship", daysAgo: 8 },
  { slug: "stg-temp-qa", title: "Temporary QA Analyst", category: "Quality", location: "Baltimore, MD", workplace: "ONSITE", employment: "TEMPORARY", experience: "Associate", daysAgo: 4 },
  { slug: "stg-external-cloud", title: "Cloud Platform Engineer", category: "Cloud", location: "Remote", workplace: "REMOTE", employment: "FULL_TIME", experience: "Senior", daysAgo: 2, external: "https://example.com/jobs/cloud-platform", company: "Northstar Public Sector" },
  { slug: "stg-external-ba", title: "Business Analyst", category: "Consulting", location: "Washington, DC", workplace: "HYBRID", employment: "CONTRACT", experience: "Mid Level", daysAgo: 7, external: "https://example.com/jobs/business-analyst", company: "Northstar Public Sector" },
  { slug: "stg-external-finance", title: "Finance Transformation Lead", category: "Finance", location: "Arlington, VA", workplace: "HYBRID", employment: "FULL_TIME", experience: "Lead", daysAgo: 12, external: "https://example.com/jobs/finance-lead", company: "Harbor Civic Systems" },
  { slug: "stg-part-time-data", title: "Part-time Data Analyst", category: "Data", location: "Hagerstown, MD", workplace: "HYBRID", employment: "PART_TIME", experience: "Associate", daysAgo: 9, skills: ["Data"] },
  { slug: "stg-expired-oracle", title: "Expired Oracle Lead", category: "Oracle", location: "Ashburn, VA", workplace: "ONSITE", employment: "FULL_TIME", experience: "Lead", daysAgo: 40, status: "EXPIRED" },
  { slug: "stg-scheduled-ai", title: "Scheduled AI Consultant", category: "AI", location: "Remote", workplace: "REMOTE", employment: "FULL_TIME", experience: "Senior", daysAgo: -10, status: "SCHEDULED" },
  { slug: "stg-draft-crm", title: "Draft CRM Role", category: "CRM", location: "Ashburn, VA", workplace: "ONSITE", employment: "FULL_TIME", experience: "Mid Level", daysAgo: 1, status: "DRAFT" },
];

function isoDays(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function stagingPortalJobs(): Job[] {
  const stamp = new Date().toISOString();
  return specs.map((spec) => {
    const status = spec.status ?? "OPEN";
    const publishedAt = status === "SCHEDULED" ? undefined : isoDays(Math.max(spec.daysAgo, 0));
    return {
      id: `staging-${spec.slug}`,
      requisitionId: `staging-req-${spec.slug}`,
      slug: spec.slug,
      title: spec.title,
      summary: `${SAMPLE} ${spec.title} for the ${spec.category} practice.`,
      description: `${SAMPLE} ${spec.title} supports Consult America delivery in ${spec.location}. This record exists so search, filters, and apply paths can be tested. It is not a production opening.`,
      careerArea: "consulting" as CareerArea,
      departmentName: spec.category,
      locationName: spec.location,
      workplaceType: spec.workplace,
      employmentType: spec.employment,
      responsibilities: [
        "Work with the delivery team on the assigned workstream.",
        "Document decisions so the next person can continue the work.",
        "Keep status visible to the project lead.",
      ],
      qualifications: ["Relevant practice experience.", "Clear written communication."],
      preferredQualifications: ["Prior public-sector or multi-entity work."],
      status,
      publishedAt,
      publishAt: status === "SCHEDULED" ? isoDays(spec.daysAgo) : undefined,
      expiresAt: status === "EXPIRED" ? isoDays(1) : undefined,
      experienceLevel: spec.experience,
      isDemo: true,
      applicationType: spec.external ? "EXTERNAL" : "INTERNAL",
      externalApplyUrl: spec.external,
      companyName: spec.company ?? "Consult America",
      companySummary: spec.company
        ? `${spec.company} is a staging employer used only to test external Apply Now.`
        : "Consult America delivers Oracle, AI, data, and application engineering work.",
      skills: spec.skills,
      salaryMin: spec.salary?.[0],
      salaryMax: spec.salary?.[1],
      salaryPeriod: spec.salary?.[2],
      verified: false,
      createdAt: stamp,
      updatedAt: stamp,
    };
  });
}
