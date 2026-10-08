/**
 * Approved content the public assistant may quote. Everything here comes from
 * copy already published on the site (components/marketing/company-copy.ts,
 * data/marketing.ts). The assistant must not state company facts that are not
 * in this module or in eligible public job data.
 */

import {
  CAPABILITIES,
  CAREERS_SUMMARY,
  COMPANY_SUMMARY,
  EASY_APPLY_FACTS,
  HIRING_STEPS,
  PHASES,
  WHY,
} from "@/components/marketing/company-copy";
import { CONTACT, INDUSTRIES } from "@/data/marketing";

export const COMPANY_TOPICS = [
  "overview",
  "capabilities",
  "oracle_cloud",
  "ai_data",
  "engineering",
  "enterprise_transformation",
  "managed_services",
  "how_we_work",
  "why_consult_america",
  "industries",
  "contact",
] as const;
export type CompanyTopic = (typeof COMPANY_TOPICS)[number];

export const CAREER_TOPICS = [
  "overview",
  "working_here",
  "areas_of_work",
  "hiring_process",
  "where_to_find_roles",
] as const;
export type CareerTopic = (typeof CAREER_TOPICS)[number];

export type KnowledgeAnswer = {
  topic: string;
  facts: string[];
  /** Where the visitor can read more. */
  links: { label: string; href: string }[];
};

const capability = (title: (typeof CAPABILITIES)[number]["title"]) => {
  const item = CAPABILITIES.find((c) => c.title === title);
  return item ? `${item.title}: ${item.body}` : title;
};

const ABOUT = { label: "About Consult America", href: "/about" };
const CAREERS = { label: "Explore Careers", href: "/careers" };
const JOBS = { label: "View open roles", href: "/jobs" };

export function getCompanyInformation(topic: CompanyTopic): KnowledgeAnswer {
  switch (topic) {
    case "overview":
      return { topic, facts: [COMPANY_SUMMARY], links: [ABOUT] };
    case "capabilities":
      return { topic, facts: CAPABILITIES.map((c) => `${c.title}: ${c.body}`), links: [ABOUT] };
    case "oracle_cloud":
      return { topic, facts: [capability("Oracle Cloud")], links: [ABOUT] };
    case "ai_data":
      return { topic, facts: [capability("AI + Data")], links: [ABOUT] };
    case "engineering":
      return { topic, facts: [capability("Engineering")], links: [ABOUT] };
    case "enterprise_transformation":
      return { topic, facts: [capability("Enterprise Transformation")], links: [ABOUT] };
    case "managed_services":
      return { topic, facts: [capability("Managed Services")], links: [ABOUT] };
    case "how_we_work":
      return {
        topic,
        facts: [
          `Every engagement moves through the same motion: ${PHASES.join(" → ")} — architecture through production delivery.`,
        ],
        links: [ABOUT],
      };
    case "why_consult_america":
      return { topic, facts: WHY.map((w) => `${w.title}: ${w.body}`), links: [ABOUT] };
    case "industries":
      return {
        topic,
        facts: INDUSTRIES.map(([name, headline, body]) => `${name} — ${headline}: ${body}`),
        links: [{ label: "Industries", href: "/#industries" }],
      };
    case "contact":
      return {
        topic,
        facts: [`Email: ${CONTACT.email}`, `Phone: ${CONTACT.phone}`],
        links: [{ label: "Talk to an expert", href: "/#contact" }],
      };
  }
}

export function getCareerInformation(topic: CareerTopic): KnowledgeAnswer {
  switch (topic) {
    case "overview":
    case "working_here":
      return {
        topic,
        facts: [
          CAREERS_SUMMARY,
          "Consulting and engineering are human businesses. Our people work where engineering, AI, and enterprise consulting meet — connecting Oracle Cloud, data intelligence, and application engineering so transformation reaches production.",
        ],
        links: [CAREERS, JOBS],
      };
    case "areas_of_work":
      return {
        topic,
        facts: [
          ...CAPABILITIES.map((c) => `${c.title}: ${c.body}`),
          "These are the practices our teams work in. Open roles vary over time and may not exist in every area.",
        ],
        links: [CAREERS, JOBS],
      };
    case "hiring_process":
      return {
        topic,
        facts: [
          ...HIRING_STEPS.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`),
          "Timelines vary by role; no specific response time is promised.",
        ],
        links: [CAREERS, JOBS],
      };
    case "where_to_find_roles":
      return {
        topic,
        facts: [
          "All current openings are listed on the Jobs page, with search by keyword and location.",
          "The Careers page describes working at Consult America and features current opportunities.",
        ],
        links: [JOBS, CAREERS],
      };
  }
}

export function getApplicationFacts(): string[] {
  return [
    `Applications use Easy Apply on each job's page.`,
    `Required: ${EASY_APPLY_FACTS.required.join(", ")}.`,
    `Optional: ${EASY_APPLY_FACTS.optional.join(", ")}.`,
    `Resume: ${EASY_APPLY_FACTS.resumeFormats}.`,
    EASY_APPLY_FACTS.note,
    EASY_APPLY_FACTS.detailed,
  ];
}
