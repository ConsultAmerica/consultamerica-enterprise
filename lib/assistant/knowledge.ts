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
import { listify, numberWord } from "@/lib/assistant/voice";

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
  "locations",
  "history",
  "leadership",
  "company_size",
  "credentials",
  "clients",
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

/**
 * A topic the company has deliberately not confirmed.
 *
 * Carrying the pieces separately (rather than one pre-written sentence) lets
 * the deterministic assistant answer in three moves: name the gap, explain why
 * it is a gap, then hand over the nearest fact that IS approved. `facts` still
 * holds a flat rendering of the same thing so AI mode and the tool layer are
 * unaffected.
 */
export type UnconfirmedTopic = {
  /** Noun phrase: what the assistant does not have. */
  what: string;
  /** Reason, phrased to follow "because …". */
  why: string;
  /** Approved facts that are adjacent to the question and worth offering. */
  instead: string[];
};

export type KnowledgeAnswer = {
  topic: string;
  facts: string[];
  /** Set only on topics that are deliberately left unconfirmed. */
  unconfirmed?: UnconfirmedTopic;
  /** Where the visitor can read more. */
  links: { label: string; href: string }[];
};

const capability = (title: (typeof CAPABILITIES)[number]["title"]) => {
  const item = CAPABILITIES.find((c) => c.title === title);
  return item ? `${item.title}: ${item.body}` : title;
};

const ABOUT = { label: "About Consult America", href: "/about" };
const EXPERT = { label: "Talk to an expert", href: "/#contact" };

/**
 * Researched company facts (public records + archived consultamerica.net),
 * 2026-10-12. Only facts confirmed by two independent sources or by the
 * company's own published site are stated. Contested items (founding year,
 * leadership names, headcount, certifications, phone) are deliberately left
 * out until the company confirms them, so the assistant says it can't confirm
 * rather than picking one source.
 */
export const RESEARCHED_FACTS = {
  legalName: "Consult America, Inc.",
  // The 2002 archived consultamerica.net already described the company as
  // established, so "more than two decades" holds under either recorded year.
  history: [
    "Consult America, Inc. has provided IT consulting from Northern Virginia for more than two decades.",
    "Its focus has grown over that time from IT consulting, staff augmentation and testing, through ERP and contract-lifecycle work, to today's Oracle Cloud, AI and data, and engineering services.",
  ],
} as const;

const NOT_CONFIRMED = (what: string) =>
  `I can't confirm ${what} from approved information yet. The Consult America team can answer that through Talk to an expert.`;
const CAREERS = { label: "Explore Careers", href: "/careers" };
const JOBS = { label: "View open roles", href: "/jobs" };

/** The practice names, for answers that list the shape of the company. */
export const PRACTICE_NAMES = CAPABILITIES.map((c) => c.title);

/**
 * Office cities without the ZIP code. The full street address belongs in an
 * addresses answer, but mid-sentence ("the headquarters in Ashburn, VA 20147")
 * a postcode is noise.
 */
const OFFICE_CITIES = CONTACT.offices.map((office) =>
  office.city.replace(/\s+\d{5}(?:-\d{4})?$/, ""),
);

const OFFICES_SENTENCE = `The company works from ${numberWord(OFFICE_CITIES.length)} offices: ${listify(OFFICE_CITIES)}.`;

export const PRACTICES_SENTENCE = `The work splits into ${numberWord(PRACTICE_NAMES.length)} practices: ${listify(PRACTICE_NAMES)}.`;

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
          `Every engagement moves through the same ${numberWord(PHASES.length)} phases: ${listify([...PHASES])}, covering architecture through to production delivery.`,
        ],
        links: [ABOUT],
      };
    case "why_consult_america":
      return { topic, facts: WHY.map((w) => `${w.title}: ${w.body}`), links: [ABOUT] };
    case "industries":
      return {
        topic,
        facts: INDUSTRIES.map(([name, headline, body]) => `${name}: ${headline}. ${body}`),
        links: [{ label: "Industries", href: "/industries" }],
      };
    case "contact":
      return {
        topic,
        facts: [
          "For projects and general enquiries, use the Talk to an expert form and the team will follow up.",
          `Careers and HR: ${CONTACT.email}`,
          ...CONTACT.offices.map((o) => `${o.label}: ${o.street}, ${o.city}`),
        ],
        links: [EXPERT],
      };
    case "locations":
      return {
        topic,
        facts: CONTACT.offices.map((o) => `${o.label}: ${o.street}, ${o.city}`),
        links: [EXPERT, { label: "Life at Consult America", href: "/life" }],
      };
    case "history":
      return {
        topic,
        facts: [
          ...RESEARCHED_FACTS.history,
          // Public records disagree (1996 vs 2000), so no year is stated.
          "Public records differ on the exact founding year, so I can't confirm it here.",
        ],
        unconfirmed: {
          what: "the exact founding year",
          why: "public records disagree on it",
          instead: [...RESEARCHED_FACTS.history],
        },
        links: [ABOUT],
      };
    case "leadership":
      return {
        topic,
        facts: [NOT_CONFIRMED("leadership names and titles")],
        unconfirmed: {
          what: "names or titles for the leadership team",
          why: "that is not part of the approved information I work from",
          instead: [RESEARCHED_FACTS.history[0], OFFICES_SENTENCE],
        },
        links: [EXPERT, ABOUT],
      };
    case "company_size":
      return {
        topic,
        facts: [NOT_CONFIRMED("a current headcount")],
        unconfirmed: {
          what: "a current headcount",
          why: "no figure for it is in the approved information I work from",
          instead: [
            RESEARCHED_FACTS.history[0],
            PRACTICES_SENTENCE,
            "If you are trying to gauge scale, the Jobs page shows every role that is open right now.",
          ],
        },
        links: [EXPERT, ABOUT],
      };
    case "credentials":
      return {
        topic,
        facts: [NOT_CONFIRMED("partner status, certifications or contract vehicles")],
        unconfirmed: {
          what: "anything confirmed on partner status, certifications or contract vehicles",
          // Deliberately blunt about the reason: a guessed certification or
          // contract vehicle is the kind of claim that can cost a bid.
          why: "none of that is in the approved information I work from",
          instead: [
            RESEARCHED_FACTS.history[0],
            "Some of the organizations Consult America has worked with are shown on the homepage.",
          ],
        },
        links: [EXPERT],
      };
    case "clients":
      return {
        topic,
        facts: [
          "Some of the organizations Consult America has worked with are shown on the homepage. Details of specific engagements aren't shared in chat; the team can discuss relevant experience through Talk to an expert.",
        ],
        links: [{ label: "See our work", href: "/#clients" }, EXPERT],
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
          "Consulting and engineering are human businesses. Our people work where engineering, AI, and enterprise consulting meet, connecting Oracle Cloud, data intelligence, and application engineering so transformation reaches production.",
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

/**
 * The Easy Apply facts, split by how they want to be read: `fields` is a list
 * and belongs in a list, `notes` are sentences and belong in prose. The flat
 * `getApplicationFacts` below keeps the shape AI mode's tool layer already
 * expects, so both modes stay grounded in exactly the same strings.
 */
export function getApplicationGuidance(): {
  where: string;
  fields: string[];
  notes: string[];
} {
  return {
    where: `Applications use Easy Apply on each job's page.`,
    fields: [
      `Required: ${EASY_APPLY_FACTS.required.join(", ")}.`,
      `Optional: ${EASY_APPLY_FACTS.optional.join(", ")}.`,
      `Resume: ${EASY_APPLY_FACTS.resumeFormats}.`,
    ],
    notes: [EASY_APPLY_FACTS.note, EASY_APPLY_FACTS.detailed],
  };
}

export function getApplicationFacts(): string[] {
  const guidance = getApplicationGuidance();
  return [guidance.where, ...guidance.fields, ...guidance.notes];
}
