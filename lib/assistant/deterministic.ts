/**
 * Deterministic public assistant: no model, no network beyond the public jobs
 * repository. A visitor's question is matched against fixed intents, and every
 * answer is assembled from the same approved sources the AI mode uses
 * (lib/assistant/knowledge.ts, data/marketing.ts, data/services.ts and public
 * job data). Nothing here generates free text, so it cannot state a fact that
 * is not already approved.
 *
 * The answers are nonetheless written to read like a person wrote them, which
 * is a deliberate split of responsibilities: this file owns routing and which
 * approved facts belong in an answer, and lib/assistant/voice.ts owns the
 * connective prose around them. Neither file contains a sentence that asserts a
 * company fact of its own, so "sounds conversational" can never turn into "made
 * something up". The facts the company has not confirmed (leadership names,
 * founding year, headcount, certifications, pricing) are answered by naming the
 * gap and handing over what IS known, never by filling it in.
 */

import { industryHref } from "@/data/industries";
import { INDUSTRIES } from "@/data/marketing";
import { SERVICES } from "@/data/services";
import type {
  AssistantContext,
  AssistantLink,
  AssistantReply,
  AssistantTurn,
} from "@/lib/assistant/engine";
import {
  getApplicationGuidance,
  getCareerInformation,
  getCompanyInformation,
  PRACTICES_SENTENCE,
  RESEARCHED_FACTS,
  type CompanyTopic,
  type KnowledgeAnswer,
} from "@/lib/assistant/knowledge";
import {
  EMPLOYMENT_TYPES,
  WORKPLACE_TYPES,
  type PublicJobDetail,
  type PublicJobSource,
  type PublicJobSummary,
} from "@/lib/assistant/tools";
import {
  ACKNOWLEDGEMENTS,
  block,
  BOOKING_ANSWERS,
  bullets,
  CAPABILITY_FRAMES,
  GREETINGS,
  JOB_SILENT_ON,
  listify,
  lowerFirst,
  noEmDash,
  numberWord,
  numbered,
  OFFERINGS_CLOSINGS,
  OFFERINGS_OPENERS,
  OVERVIEW_CLOSINGS,
  OVERVIEW_OPENERS,
  para,
  pick,
  PRICING_ANSWERS,
  replySeed,
  SERVICE_CLOSINGS,
  SERVICE_FRAMES,
  STEERS,
  SUGGESTED_TOPICS,
  UNCONFIRMED_BRIDGES,
  UNCONFIRMED_NEXT,
  UNCONFIRMED_OPENERS,
  UNKNOWN_ANSWERS,
  upperFirst,
} from "@/lib/assistant/voice";

export type DeterministicDeps = {
  jobs: PublicJobSource;
  log?: (event: { event: "intent"; intent: string }) => void;
};

const MAX_CARDS = 6;

const TALK_TO_EXPERT: AssistantLink = {
  label: "Talk to an expert",
  href: "/#contact",
  action: "talk_to_expert",
};
const JOBS_LINK: AssistantLink = { label: "View Jobs", href: "/jobs" };
const CAREERS_LINK: AssistantLink = {
  label: "Explore Careers",
  href: "/careers",
};
const ABOUT_LINK: AssistantLink = {
  label: "About Consult America",
  href: "/about",
};

/**
 * Links that arrive from lib/assistant/knowledge.ts are plain hrefs. Any of
 * them pointing at the enquiry form has to be swapped for TALK_TO_EXPERT so the
 * palette opens the form in place instead of navigating away, and it has to
 * happen before the link list is deduped: dedupe keeps the first entry, so a
 * plain /#contact ahead of TALK_TO_EXPERT would silently win and lose the
 * action.
 */
const asLinks = (links: { label: string; href: string }[]): AssistantLink[] =>
  links.map((l) => (l.href === TALK_TO_EXPERT.href ? TALK_TO_EXPERT : l));

/**
 * Every reply is built here, which makes this the one place that has to enforce
 * the no-em-dash rule. Approved copy still contains " — " in several strings
 * and paraphrasing it would risk drifting off the fact, so the punctuation is
 * rewritten on the way out instead. Doing it at the choke point rather than at
 * each call site means no future answer can leak one.
 */
function reply(
  text: string,
  links: AssistantLink[],
  grounding: AssistantReply["grounding"] = [],
  jobs: PublicJobSummary[] = [],
): AssistantReply {
  const seen = new Set<string>();
  return {
    status: "ok",
    reply: noEmDash(text),
    jobs: jobs.slice(0, MAX_CARDS),
    links: links
      .filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true)))
      .slice(0, 4),
    grounding,
  };
}

function fallback(text: string, links: AssistantLink[]): AssistantReply {
  return {
    status: "fallback",
    reply: noEmDash(text),
    jobs: [],
    links,
    grounding: [],
  };
}

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9+&\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

const has = (text: string, pattern: RegExp) => pattern.test(text);

// ---------------------------------------------------------------- intents

const RX = {
  greeting:
    /^ (hi|hello|hey|hiya|good (morning|afternoon|evening)|thanks|thank you|ok|okay)( there)?( consult america)? $/,
  booking:
    /\b(book|schedule|set up|setup|arrange|request|get)\b.{0,30}\b(call|meeting|demo|consultation|appointment|chat|time)\b|\b(talk|speak|chat|connect|meet)\b.{0,25}\b(expert|someone|somebody|sales|person|human|team|consultant|representative|rep)\b|\bconsultation\b|\bget in touch\b|\bcontact sales\b|\bwork with (you|consult america)\b|\bhire (you|your team|consult america)\b|\bcall me\b/,
  pricing: /\b(price|pricing|cost|costs|rates?|fees?|quote|budget|how much)\b/,
  applyJob:
    /\b(apply|applying|application|submit (my )?(resume|cv)|send (my )?(resume|cv))\b/,
  hiringProcess:
    /\b(hiring|interview|recruit(ing|ment)?|selection) process\b|\binterviews?\b|\bhear back\b|\bhow (do|does) (you|consult america) hire\b/,
  jobs: /\b(jobs?|openings?|vacanc(y|ies)|positions?|roles?|opportunit(y|ies)|hiring|work (for|at) (you|consult america)|join (you|your team|consult america)|internships?)\b/,
  careers:
    /\b(careers?|culture|life at|working (here|at)|benefits|employee experience)\b/,
  leadership:
    /\b(ceo|founders?|founded by|president|owners?|leadership|leaders|executives?|management team|managing director|who runs|who leads|who owns|chairman|director)\b/,
  history:
    /\b(founded|established|incorporated|history|how old|since when|when (was|did) .{0,30}(start|begin|found|establish)|years in business|how long have you)\b/,
  locations:
    /\b(headquarters?|hq|offices?|located|locations?|address|where are you|where is consult america|based)\b/,
  size: /\b(employees|how many people|headcount|staff size|team size|company size|how big|size of (the )?(company|team)|people work)\b/,
  contact:
    /\b(email|e-mail|phone|telephone|contact|reach (you|out)|mailing address)\b/,
  credentials:
    /\b(certif\w*|partners?|partnership|accredit\w*|8 ?a|minority|small business|gsa|government contract\w*|federal|cage|uei|iso)\b/,
  clients:
    /\b(clients?|customers?|who (have you|do you) work(ed)? (with|for)|case stud(y|ies)|references?)\b/,
  industries: /\b(industr(y|ies)|sectors?|verticals?)\b/,
  howWeWork:
    /\b(how (do )?you work|approach|methodology|process|engagement model|delivery model|phases)\b/,
  // "why should we choose you" is the common phrasing, so the optional
  // should/would and subject in the middle matter more than the bare "why
  // choose" that was here first.
  why: /\bwhy (should |would |do |did )?(i |we |you |anyone |a client )?(choose|pick|use|work with|go with|hire)\b|\bwhat makes .{0,30}different\b|\bstand out\b|\bdifferentiat\w*\b|\bwhy consult america\b/,
  /** "Who are you" / "what is Consult America": the company, not its menu. */
  overview:
    /\b(who (are you|is consult america)|what is consult america|tell me about (you|consult america|the company|your company)|about (you|consult america|the company|your company)|company overview|what (do|does) (you|consult america) do)\b/,
  /** "What services do you offer": the menu, not the company. */
  offerings:
    /\b(services?|service lines?|capabilit(y|ies)|offer(ings?)?|practices?|expertise|specialit(y|ies)|specialt(y|ies)|what can you (do|offer|help))\b/,
  /**
   * Commercial intent. Not used for routing, only to decide whether an answer
   * should end by offering a human: someone asking how to be helped, scoped or
   * billed has a question this chat genuinely cannot finish.
   */
  commercial:
    /\b(price|pricing|cost|costs|rates?|fees?|quote|budget|how much|engagement|statement of work|sow|rfp|proposal|retainer)\b|\b(can|could|would) you (help|assist|support|build|do|take on)\b|\bwe (need|want|are looking for|re looking for)\b|\bour (company|team|organi[sz]ation|business|project|systems?)\b|\b(hire|work with|engage) (you|your team|consult america)\b/,
} as const;

/**
 * Practice regexes, in priority order: Oracle first, because "Oracle ERP" also
 * trips the generic ERP and transformation patterns. The practice title and
 * body are read back out of approved copy rather than repeated here.
 */
const CAPABILITY_RX: [RegExp, CompanyTopic][] = [
  [/\boracle\b|\bfusion\b|\boci\b|\berp\b|\bhcm\b|\bscm\b|\bepm\b/, "oracle_cloud"],
  [
    /\b(ai|artificial intelligence|machine learning|ml|genai|gen ai|llms?|data|analytics|forecasting|chatbots?|copilots?)\b/,
    "ai_data",
  ],
  [
    /\b(engineering|software|development|developers|cloud native|integration|modernization|devops)\b/,
    "engineering",
  ],
  [
    /\b(managed services?|support|sre|monitoring|operations|run and evolve)\b/,
    "managed_services",
  ],
  [
    /\b(transformation|finance|procurement|supply chain|operating model|automation)\b/,
    "enterprise_transformation",
  ],
];

/**
 * Which CAPS entry each practice is, so a practice answer can name the service
 * lines underneath it. CAPABILITIES (components/marketing/company-copy.ts) and
 * CAPS (data/marketing.ts) are in different orders and spell "AI + Data" and
 * "AI & Data" differently, and SERVICES.cap indexes CAPS, so the mapping has to
 * be explicit rather than by position or by title.
 */
const CAP_INDEX: Partial<Record<CompanyTopic, number>> = {
  engineering: 0,
  ai_data: 1,
  oracle_cloud: 2,
  enterprise_transformation: 3,
  managed_services: 4,
};

/** Extra phrasings for service pages, beyond words in the service title. */
const SERVICE_ALIASES: Record<string, RegExp> = {
  "oracle-erp": /\boracle (erp|financials|fusion financials)\b|\berp\b/,
  "oracle-scm": /\boracle scm\b|\bscm\b/,
  "oracle-hcm": /\boracle hcm\b|\bhcm\b|\bpayroll\b|\bhuman capital\b/,
  "oracle-epm": /\boracle epm\b|\bepm\b|\bplanning and budgeting\b/,
  "oracle-cloud-infrastructure": /\boci\b|\boracle cloud infrastructure\b/,
  "genai-assistants-copilots":
    /\b(genai|gen ai|generative ai|chatbots?|copilots?|assistants?|llms?|rag)\b/,
  "forecasting-machine-learning":
    /\b(forecasting|machine learning|ml models?|predictive)\b/,
  "data-platform-warehousing":
    /\b(data platforms?|data warehouses?|warehousing|data lakes?|pipelines?|etl)\b/,
  "document-contract-intelligence":
    /\b(document|contract) (intelligence|processing|extraction|ai)\b|\bocr\b/,
  "data-governance-guardrails":
    /\b(data governance|guardrails|ai governance)\b/,
  "cloud-native-development":
    /\b(cloud native|kubernetes|microservices|containers)\b/,
  "platform-engineering":
    /\bplatform engineering\b|\bdeveloper platform\b|\binternal platform\b/,
  "api-systems-integration":
    /\b(apis?|integrations?|oic|mulesoft|systems integration)\b/,
  "application-modernization":
    /\b(modernization|modernize|legacy|mainframe|re-?platform\w*)\b/,
  "quality-test-automation":
    /\b(testing|test automation|qa|quality assurance)\b/,
  "finance-transformation":
    /\b(finance transformation|financial close|close process)\b/,
  "procurement-sourcing": /\b(procurement|sourcing)\b/,
  "supply-chain-operations": /\bsupply chain\b|\blogistics\b|\binventory\b/,
  "process-automation": /\b(process automation|rpa|workflow automation)\b/,
  "operating-model-design": /\boperating model\b/,
  "application-support": /\b(application support|app support|help ?desk|ams)\b/,
  "cloud-infrastructure-operations":
    /\b(cloud operations|infrastructure operations|cloud ops)\b/,
  "monitoring-sre": /\b(sre|site reliability|monitoring|observability)\b/,
  "continuous-improvement": /\bcontinuous improvement\b/,
  "specialized-talent":
    /\b(staffing|staff augmentation|talent|contractors?|consultants? (for hire|on demand)|hire (engineers|developers|consultants))\b/,
};

function matchServices(text: string) {
  return SERVICES.filter((service) => {
    const alias = SERVICE_ALIASES[service.slug];
    return (
      (alias && alias.test(text)) ||
      text.includes(` ${service.title.toLowerCase()} `)
    );
  });
}

// ---------------------------------------------------------------- voice state

/**
 * Everything an answer needs to know about the conversation it is part of,
 * resolved once per request. `turn` counts the questions asked including this
 * one, so `turn === 1` is a first impression.
 */
type Voice = {
  seed: number;
  turn: number;
  commercial: boolean;
};

function voiceFor(turns: AssistantTurn[], text: string): Voice {
  return {
    seed: replySeed(turns),
    turn: turns.filter((t) => t.role === "user").length,
    commercial: has(text, RX.commercial),
  };
}

/**
 * The closing nudge toward the enquiry form, or null.
 *
 * The link itself already rides along on most answers, so the only question
 * here is whether to spend a sentence on it. Never on the first reply: leading
 * with "talk to sales" before answering anything is what makes a site bot feel
 * like a funnel. From the second question on it is offered when the question is
 * commercial (pricing, scoping, "can you help us with X"), because that is a
 * question this chat genuinely cannot finish, and from the third question on
 * regardless, because by then the visitor is clearly researching properly and
 * an introduction is useful rather than pushy.
 */
function steer(v: Voice): string | null {
  if (v.turn < 2) return null;
  if (!v.commercial && v.turn < 3) return null;
  return pick(v.seed, 31, STEERS);
}

/**
 * Appends the nudge when it is due. Candidate-facing answers (jobs, careers,
 * applications) deliberately never call this: the right next step for someone
 * reading a job posting is to apply, not to be routed at a sales form.
 */
function withSteer(
  v: Voice,
  text: string,
  links: AssistantLink[],
  grounding: AssistantReply["grounding"] = ["company"],
  jobs: PublicJobSummary[] = [],
): AssistantReply {
  const nudge = steer(v);
  if (!nudge) return reply(text, links, grounding, jobs);
  return reply(
    text.includes("\n") ? `${text}\n${nudge}` : `${text} ${nudge}`,
    [...links, TALK_TO_EXPERT],
    grounding,
    jobs,
  );
}

// ------------------------------------------------------- unconfirmed answers

/**
 * The answer shape for anything the company has not confirmed. It never ends
 * at the refusal: name the gap and the reason, hand over the nearest approved
 * facts, then offer the one route that can actually settle it. A visitor who
 * asked who the CEO is should still leave knowing where the company is based
 * and how long it has been operating.
 */
function answerUnconfirmed(
  v: Voice,
  answer: KnowledgeAnswer,
  links: AssistantLink[],
): AssistantReply {
  const gap = answer.unconfirmed;
  if (!gap) return reply(para(...answer.facts), links, ["company"]);
  return reply(
    para(
      pick(v.seed, 11, UNCONFIRMED_OPENERS)(gap.what, gap.why),
      pick(v.seed, 12, UNCONFIRMED_BRIDGES),
      ...gap.instead,
      pick(v.seed, 13, UNCONFIRMED_NEXT),
    ),
    asLinks([...links, TALK_TO_EXPERT]),
    ["company"],
  );
}

// ---------------------------------------------------------------- company

/**
 * The researched fact in RESEARCHED_FACTS.history[0] with its subject replaced
 * by a pronoun. The overview answer has already named the company in the
 * sentence before, and saying it twice reads like a press release. Only the
 * subject changes, so the claim is identical; if the approved wording ever
 * changes the replace is a no-op and the original sentence is used.
 */
const DECADES = RESEARCHED_FACTS.history[0].replace(
  "Consult America, Inc. has",
  "It has",
);

function answerOverview(v: Voice): AssistantReply {
  return withSteer(
    v,
    para(
      pick(v.seed, 1, OVERVIEW_OPENERS),
      getCompanyInformation("overview").facts[0],
      DECADES,
      PRACTICES_SENTENCE,
      pick(v.seed, 2, OVERVIEW_CLOSINGS),
    ),
    [ABOUT_LINK, TALK_TO_EXPERT],
  );
}

function answerOfferings(v: Voice): AssistantReply {
  return withSteer(
    v,
    block(
      pick(v.seed, 3, OFFERINGS_OPENERS),
      bullets(getCompanyInformation("capabilities").facts),
      pick(v.seed, 4, OFFERINGS_CLOSINGS),
    ),
    [ABOUT_LINK, TALK_TO_EXPERT],
  );
}

/**
 * One practice, answered as a sentence rather than a label and a colon. The
 * title and body are split back out of the approved "Title: body" fact so the
 * words the visitor reads are exactly the words on the site.
 */
function answerCapability(v: Voice, topic: CompanyTopic): AssistantReply {
  const fact = getCompanyInformation(topic).facts[0];
  const split = fact.indexOf(": ");
  const title = split > 0 ? fact.slice(0, split) : fact;
  const body = split > 0 ? fact.slice(split + 2) : "";
  const cap = CAP_INDEX[topic];
  const lines =
    cap === undefined
      ? []
      : SERVICES.filter((s) => s.cap === cap).map((s) => s.title);
  return withSteer(
    v,
    para(
      pick(v.seed, 5, CAPABILITY_FRAMES)(title, lowerFirst(noEmDash(body))),
      lines.length > 0 &&
        pick(v.seed, 6, [
          `Underneath it sit ${listify(lines)}.`,
          `The service lines in there are ${listify(lines)}.`,
        ]),
    ),
    [ABOUT_LINK, TALK_TO_EXPERT],
  );
}

function answerServices(
  v: Voice,
  services: (typeof SERVICES)[number][],
): AssistantReply {
  const links = [
    ...services.map((s) => ({ label: s.title, href: `/services/${s.slug}` })),
    TALK_TO_EXPERT,
  ];
  if (services.length === 1) {
    const only = services[0];
    return withSteer(
      v,
      para(
        pick(v.seed, 7, SERVICE_FRAMES)(only.title, lowerFirst(only.dek)),
        pick(v.seed, 8, SERVICE_CLOSINGS),
      ),
      links,
    );
  }
  return withSteer(
    v,
    block(
      pick(v.seed, 7, [
        `${upperFirst(numberWord(services.length))} of our service lines cover that:`,
        `That spans ${numberWord(services.length)} service lines:`,
      ]),
      bullets(services.map((s) => `${s.title}: ${s.dek}`)),
      "Open whichever is closest and the page sets out the scope, how an engagement runs, and the deliverables.",
    ),
    links,
  );
}

function answerIndustry(
  v: Voice,
  industry: (typeof INDUSTRIES)[number],
): AssistantReply {
  const [name, headline, body] = industry;
  return withSteer(
    v,
    para(
      pick(v.seed, 9, [
        `${name} is one of the sectors we focus on.`,
        `Yes, ${name} is one of our focus sectors.`,
        `We do work in ${name}.`,
      ]),
      `${headline}: ${lowerFirst(body)}`,
    ),
    [{ label: name, href: industryHref(name) }, TALK_TO_EXPERT],
  );
}

function answerIndustries(v: Voice): AssistantReply {
  const answer = getCompanyInformation("industries");
  return withSteer(
    v,
    block(
      pick(v.seed, 9, [
        `${upperFirst(numberWord(answer.facts.length))} sectors, each with its own angle:`,
        `We concentrate on ${numberWord(answer.facts.length)} sectors:`,
      ]),
      bullets(answer.facts),
      "If yours is not on that list, tell me what you are trying to do and I can say whether it maps onto one of these.",
    ),
    asLinks([...answer.links, TALK_TO_EXPERT]),
  );
}

function answerLocations(v: Voice): AssistantReply {
  const answer = getCompanyInformation("locations");
  return withSteer(
    v,
    block(
      pick(v.seed, 10, [
        `We work out of ${numberWord(answer.facts.length)} offices:`,
        `Here is where we are based:`,
        `${upperFirst(numberWord(answer.facts.length))} offices, headquarters first:`,
      ]),
      bullets(answer.facts),
      pick(v.seed, 14, [
        "There is more on the Life at Consult America page if you want a look around.",
        "If you are trying to reach one of them in particular, the team can route you from Talk to an expert.",
      ]),
    ),
    asLinks([...answer.links, TALK_TO_EXPERT]),
  );
}

function answerContact(v: Voice): AssistantReply {
  const answer = getCompanyInformation("contact");
  return reply(
    block(
      pick(v.seed, 10, [
        "Depends who you need, so here is the full set:",
        "A few routes in, depending on what it is about:",
      ]),
      bullets(answer.facts),
    ),
    asLinks(answer.links),
    ["company"],
  );
}

function answerClients(v: Voice): AssistantReply {
  const answer = getCompanyInformation("clients");
  return reply(
    para(
      pick(v.seed, 15, [
        "Partly, and I will be clear about which part.",
        "Some of that is public and some of it is not.",
        "I can point you at the public half of that.",
      ]),
      ...answer.facts,
    ),
    asLinks(answer.links),
    ["company"],
  );
}

function answerWhy(v: Voice): AssistantReply {
  const answer = getCompanyInformation("why_consult_america");
  return withSteer(
    v,
    block(
      pick(v.seed, 16, [
        `${upperFirst(numberWord(answer.facts.length))} things we would point at:`,
        `The honest pitch, in ${numberWord(answer.facts.length)} parts:`,
        `What we would say about that:`,
      ]),
      bullets(answer.facts),
    ),
    asLinks([...answer.links, TALK_TO_EXPERT]),
  );
}

function answerHowWeWork(v: Voice): AssistantReply {
  const answer = getCompanyInformation("how_we_work");
  return withSteer(
    v,
    para(
      pick(v.seed, 17, [
        "Same shape every time.",
        "It is deliberately repeatable.",
        "There is a fixed motion to it.",
      ]),
      ...answer.facts,
      pick(v.seed, 18, [
        "Tell me roughly where your project is now and I can say which part of that it joins at.",
        "Plenty of engagements join partway through, so it depends where you already are.",
      ]),
    ),
    asLinks([...answer.links, TALK_TO_EXPERT]),
  );
}

// ---------------------------------------------------------------- careers

function answerCareers(v: Voice): AssistantReply {
  const answer = getCareerInformation("working_here");
  return reply(
    para(
      pick(v.seed, 19, [
        "Here is how we think about it.",
        "The short version:",
        "Honestly, the pitch is simple.",
      ]),
      ...answer.facts,
      pick(v.seed, 20, [
        "The clearest read on it is the roles that are actually open, so say the word and I will pull those up.",
        "Careers covers it in more depth, and the Jobs page shows what that looks like right now.",
      ]),
    ),
    answer.links,
    ["careers"],
  );
}

function answerHiringProcess(v: Voice): AssistantReply {
  const answer = getCareerInformation("hiring_process");
  // The steps arrive already numbered from knowledge.ts; anything unnumbered is
  // a caveat and belongs in prose, not in the list.
  const isStep = (fact: string) => /^\d+\. /.test(fact);
  const steps = answer.facts.filter(isStep).map((s) => s.replace(/^\d+\. /, ""));
  const notes = answer.facts.filter((f) => !isStep(f));
  return reply(
    block(
      pick(v.seed, 21, [
        `${upperFirst(numberWord(steps.length))} steps, and none of them should surprise you:`,
        `It runs in ${numberWord(steps.length)} steps:`,
        `Here is the whole process, start to finish:`,
      ]),
      numbered(steps),
      para(...notes),
    ),
    answer.links,
    ["careers"],
  );
}

// ---------------------------------------------------------------- jobs

const STOPWORDS = new Set(
  "a an the and or of for to in on at by with from about any some all your you we our us me my i is are am be do does did have has can could would should will what which who whom where when how there here this that these those it its open opened current currently available availability now right now job jobs opening openings role roles position positions vacancy vacancies opportunity opportunities hiring hire work working career careers apply list show see find search looking look want need interested into get tell please consult america consultamerica company remote hybrid onsite on-site site office full time part temporary contract internship internships based near".split(
    " ",
  ),
);

function jobFilters(text: string) {
  const workplaceType = has(text, /\bremote\b/)
    ? "Remote"
    : has(text, /\bhybrid\b/)
      ? "Hybrid"
      : has(text, /\b(on-?site|in office|in-person)\b/)
        ? "On-site"
        : undefined;
  const employmentType = has(text, /\bfull[ -]?time\b/)
    ? "Full Time"
    : has(text, /\bpart[ -]?time\b/)
      ? "Part Time"
      : has(text, /\binternships?\b|\bintern\b/)
        ? "Internship"
        : has(text, /\btemporary\b|\btemp\b/)
          ? "Temporary"
          : has(
                text,
                /\bcontract (roles?|jobs?|positions?|work)\b|\bcontractor\b/,
              )
            ? "Contract"
            : undefined;
  const loc = text.match(
    /\b(?:in|near|around|based in|located in) ([a-z][a-z .-]{1,40}?)(?= (?:area|region|state)? ?$| for | with | that | which | are | is )/,
  );
  const location =
    loc && !STOPWORDS.has(loc[1].trim()) ? loc[1].trim() : undefined;
  const words = text
    .replace(loc ? loc[0] : "", " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  const query = words.slice(0, 3).join(" ") || undefined;
  return {
    query,
    location,
    workplaceType: workplaceType as
      (typeof WORKPLACE_TYPES)[number] | undefined,
    employmentType: employmentType as
      (typeof EMPLOYMENT_TYPES)[number] | undefined,
  };
}

/** Place names come out of `normalize` lowercased; they read badly that way. */
const titleCase = (text: string) =>
  text.replace(/\b[a-z]/g, (c) => c.toUpperCase());

async function answerJobs(
  text: string,
  v: Voice,
  deps: DeterministicDeps,
): Promise<AssistantReply> {
  const filters = jobFilters(text);
  try {
    let result = await deps.jobs.search({ ...filters, limit: MAX_CARDS });
    let missed: string | undefined;
    if (result.total === 0 && filters.query) {
      // Keep the visitor's filters but drop the keyword before giving up.
      const broader = await deps.jobs.search({
        ...filters,
        query: undefined,
        limit: MAX_CARDS,
      });
      if (broader.total > 0) {
        missed = filters.query;
        result = broader;
      }
    }
    // Describes the filters that are still in force. The dropped keyword is
    // deliberately not in here: the results no longer match it.
    const narrowed = [
      [filters.workplaceType, filters.employmentType]
        .filter(Boolean)
        .join(", ")
        .toLowerCase(),
      filters.location ? `in ${titleCase(filters.location)}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (result.total === 0) {
      const narrowedAnything =
        filters.query ||
        filters.location ||
        filters.workplaceType ||
        filters.employmentType;
      return reply(
        narrowedAnything
          ? pick(v.seed, 22, [
              "Nothing open that matches that right now. The Jobs page carries every current opening if you want to widen the search, and anything new shows up there first.",
              "No current openings fit that, I am afraid. The full list on the Jobs page is worth a look, since the board turns over.",
            ])
          : pick(v.seed, 22, [
              "We don't have any open roles at the moment, so there is nothing for me to point you at today. The Careers page covers how we hire and the kind of work each practice does, and new roles land on the Jobs page first.",
              "We don't have any open roles at the moment. Worth reading Careers for how the hiring process runs, then checking the Jobs page again later, since that is where anything new appears.",
            ]),
        [CAREERS_LINK, JOBS_LINK],
        ["jobs"],
      );
    }

    const count = `${result.total} ${result.total === 1 ? "opening" : "openings"}`;
    const isAre = result.total === 1 ? "is" : "are";
    const matching = narrowed ? ` matching ${narrowed}` : "";
    const lead = missed
      ? `Nothing came up for "${missed}" specifically, so here is the wider list: ${count}${matching}.`
      : pick(v.seed, 23, [
          `Yes, we are hiring. There ${isAre} ${count}${matching} right now.`,
          `${upperFirst(count)}${matching} at the moment.`,
          `Right now there ${isAre} ${count}${matching}.`,
        ]);
    // Four cases, because "the first 1 are below" and "here they are" for a
    // single role are exactly the seams that make an assistant read as canned.
    const shown =
      result.total > result.jobs.length
        ? result.jobs.length === 1
          ? "One of them is below, and the Jobs page has the rest."
          : `The first ${result.jobs.length} are below, and the Jobs page has the rest.`
        : result.total === 1
          ? pick(v.seed, 24, ["Here it is.", "It is below."])
          : pick(v.seed, 24, ["Here they are.", "All of them are below."]);
    return reply(
      para(lead, shown),
      [{ label: "View all jobs", href: "/jobs" }],
      ["jobs"],
      result.jobs,
    );
  } catch {
    return fallback(
      "I'm having trouble searching current openings right now. You can browse Jobs directly.",
      [{ label: "Browse Jobs", href: "/jobs" }],
    );
  }
}

/** First sentence of the posting that mentions `rx`, quoted verbatim. */
function quote(job: PublicJobDetail, rx: RegExp): string | null {
  const text = [
    job.summary,
    job.description,
    ...job.qualifications,
    ...job.preferredQualifications,
  ].join(" ");
  const sentence = text
    .split(/(?<=[.!?])\s+/)
    .find((s) => rx.test(s.toLowerCase()));
  return sentence ? sentence.trim().slice(0, 300) : null;
}

async function answerThisJob(
  text: string,
  slug: string,
  v: Voice,
  deps: DeterministicDeps,
): Promise<AssistantReply | null> {
  // `starts?` rather than only "start date": on a job page "when does it start"
  // is unambiguously about this role, and without it the question fell through
  // to the generic dispatcher and came back as "I don't know".
  const aboutThisJob =
    /\b(this|the) (job|role|position|posting|opening)\b|\b(skills?|requirements?|required|qualifications?|experience|salary|pay|compensation|remote|hybrid|on-?site|located|location|where|visa|sponsor\w*|benefits|responsibilit\w*|duties|full[ -]?time|part[ -]?time|employment type|starts?|start date|apply)\b/;
  if (!aboutThisJob.test(text)) return null;
  let job: PublicJobDetail | null;
  try {
    job = await deps.jobs.get(slug);
  } catch {
    return fallback(
      "Job details are temporarily unavailable. You can browse Jobs directly.",
      [{ label: "Browse Jobs", href: "/jobs" }],
    );
  }
  if (!job) {
    return reply(
      "This one is no longer a current public opening, so the posting has come down. Here is what is open instead.",
      [JOBS_LINK],
      ["jobs"],
    );
  }
  const cards = [job];
  const g: AssistantReply["grounding"] = ["jobs"];
  const view: AssistantLink[] = [{ label: "View job", href: job.viewHref }];
  const silentOn = (what: string) => pick(v.seed, 25, JOB_SILENT_ON)(what);
  const quoted = (rx: RegExp, what: string) => {
    const found = quote(job as PublicJobDetail, rx);
    return found
      ? para(
          pick(v.seed, 26, [
            "The posting covers that directly:",
            "That one is in the posting:",
            "Straight from the posting:",
          ]),
          `"${found}"`,
        )
      : silentOn(what);
  };

  if (has(text, /\b(apply|application)\b/)) return answerApply(v, job);
  if (has(text, /\b(salary|pay|compensation|wage|rate)\b/)) {
    return reply(
      job.salaryLabel
        ? para(
            `${job.title} lists ${job.salaryLabel}.`,
            pick(v.seed, 27, [
              "Anything beyond that comes from the recruiting team.",
              "The recruiters can talk through the rest of the package.",
            ]),
          )
        : silentOn("a salary"),
      view,
      g,
      cards,
    );
  }
  if (has(text, /\b(visa|sponsor\w*|h-?1b|work authori[sz]ation)\b/)) {
    return reply(quoted(/visa|sponsor|authori[sz]/, "visa sponsorship"), view, g, cards);
  }
  if (has(text, /\b(benefits|pto|insurance|401k)\b/)) {
    return reply(quoted(/benefit|pto|insurance|401/, "benefits"), view, g, cards);
  }
  if (has(text, /\bstart date\b|\bwhen (does|would) .{0,20}start\b/))
    return reply(silentOn("a start date"), view, g, cards);
  if (
    has(text, /\b(remote|hybrid|on-?site|in office|located|location|where)\b/)
  ) {
    const place = job.location
      ? `based in ${job.location}`
      : "without a location on the posting";
    const mode = job.workplaceType ? `listed as ${job.workplaceType}` : "";
    return reply(
      job.location || job.workplaceType
        ? para(
            `${job.title} is ${[place, mode].filter(Boolean).join(" and ")}.`,
            job.employmentType &&
              pick(v.seed, 28, [
                `It is a ${job.employmentType} role.`,
                `Employment type on it is ${job.employmentType}.`,
              ]),
          )
        : silentOn("a location"),
      view,
      g,
      cards,
    );
  }
  if (
    has(
      text,
      /\b(full[ -]?time|part[ -]?time|contract|employment type|permanent)\b/,
    )
  ) {
    return reply(
      job.employmentType
        ? para(
            `${job.title} is a ${job.employmentType} role.`,
            job.workplaceType && `The posting lists it as ${job.workplaceType}.`,
          )
        : silentOn("an employment type"),
      view,
      g,
      cards,
    );
  }
  if (
    has(
      text,
      /\b(responsibilit\w*|duties|day to day|what (will|would) i (do|be doing))\b/,
    )
  ) {
    return reply(
      job.responsibilities.length
        ? block(
            pick(v.seed, 29, [
              "Day to day, the posting lists:",
              "What the posting puts on the role:",
            ]),
            bullets(job.responsibilities.slice(0, 6)),
          )
        : silentOn("the day to day responsibilities"),
      view,
      g,
      cards,
    );
  }
  if (
    has(
      text,
      /\b(skills?|requirements?|required|qualifications?|experience|need|tech stack|technologies)\b/,
    )
  ) {
    const skills = job.skills.slice(0, 10).join(", ");
    const quals = job.qualifications.slice(0, 5);
    if (!skills && quals.length === 0) return reply(silentOn("the required skills"), view, g, cards);
    return reply(
      block(
        para(
          skills &&
            pick(v.seed, 30, [
              `${job.title} leans on ${skills}.`,
              `For ${job.title} the posting names ${skills}.`,
            ]),
          quals.length > 0 && (skills ? "It also asks for:" : "The posting asks for:"),
        ),
        quals.length > 0 ? bullets(quals) : "",
      ),
      view,
      g,
      cards,
    );
  }
  return reply(
    para(
      pick(v.seed, 30, [
        `Here is the short version of ${job.title}:`,
        `${job.title}, in one line:`,
      ]),
      lowerFirst(job.summary || job.title),
    ),
    view,
    g,
    cards,
  );
}

function answerApply(
  v: Voice,
  job?: PublicJobDetail | PublicJobSummary,
): AssistantReply {
  if (job && job.applyIsExternal) {
    return reply(
      para(
        `${job.title} is applied for on the employer's own site rather than here.`,
        "The link below goes straight to their form.",
      ),
      [{ label: "Apply on employer site", href: job.applyHref }],
      ["application"],
    );
  }
  const guidance = getApplicationGuidance();
  if (job) {
    return reply(
      block(
        pick(v.seed, 32, [
          `For ${job.title}, Easy Apply on the job page is the way in. What it asks for:`,
          `Applying to ${job.title} is a short form, nothing more. What you will need:`,
        ]),
        bullets(guidance.fields),
        para(...guidance.notes),
      ),
      [
        { label: "Easy Apply", href: job.applyHref },
        {
          label: "Detailed application",
          href: `/jobs/${job.slug}/apply/detailed`,
        },
      ],
      ["application"],
    );
  }
  return reply(
    block(
      pick(v.seed, 32, [
        "Applications live on each role's own page, so the first step is picking one from the Jobs page and using Easy Apply. What it asks for:",
        "Pick the role first: every application goes through Easy Apply on that job's page. What you will need:",
      ]),
      bullets(guidance.fields),
      para(...guidance.notes),
    ),
    [{ label: "View open roles", href: "/jobs" }],
    ["application"],
  );
}

// ---------------------------------------------------------------- main

export { SUGGESTED_TOPICS };

export async function answerDeterministically(
  turns: AssistantTurn[],
  context: AssistantContext,
  deps: DeterministicDeps,
): Promise<AssistantReply> {
  const last = [...turns].reverse().find((t) => t.role === "user");
  const text = normalize(last?.content ?? "");
  const v = voiceFor(turns, text);
  const log = (intent: string) => deps.log?.({ event: "intent", intent });

  if (text.trim() === "" || has(text, RX.greeting)) {
    log("greeting");
    // A "hi" opens the conversation; a "thanks" three questions in is closing
    // one, and replying with the same menu both times is the tell of a bot.
    return v.turn > 1
      ? reply(pick(v.seed, 0, ACKNOWLEDGEMENTS), [JOBS_LINK, ABOUT_LINK])
      : reply(pick(v.seed, 0, GREETINGS), [TALK_TO_EXPERT, ABOUT_LINK]);
  }

  if (has(text, RX.booking)) {
    log("booking");
    return reply(pick(v.seed, 33, BOOKING_ANSWERS), [TALK_TO_EXPERT], ["company"]);
  }

  if (context.page === "job") {
    const answer = await answerThisJob(text, context.jobSlug, v, deps);
    if (answer) {
      log("this_job");
      return answer;
    }
  }

  if (has(text, RX.applyJob)) {
    log("apply");
    return answerApply(v);
  }
  if (has(text, RX.hiringProcess)) {
    log("hiring_process");
    return answerHiringProcess(v);
  }
  if (has(text, RX.jobs) && !has(text, RX.leadership)) {
    log("jobs");
    return answerJobs(text, v, deps);
  }
  if (has(text, RX.careers)) {
    log("careers");
    return answerCareers(v);
  }

  if (has(text, RX.pricing)) {
    log("pricing");
    return reply(pick(v.seed, 34, PRICING_ANSWERS), [TALK_TO_EXPERT], ["company"]);
  }

  // Topics the company has deliberately not confirmed. They are checked before
  // anything else about the company so a question about the CEO can never be
  // answered with the capabilities blurb instead.
  const unconfirmedTopics: [RegExp, CompanyTopic][] = [
    [RX.leadership, "leadership"],
    [RX.history, "history"],
    [RX.size, "company_size"],
    [RX.credentials, "credentials"],
  ];
  for (const [rx, topic] of unconfirmedTopics) {
    if (has(text, rx)) {
      log(topic);
      const answer = getCompanyInformation(topic);
      return answerUnconfirmed(v, answer, answer.links);
    }
  }

  // Contact before locations: RX.locations matches "address", so "what is your
  // email address" would otherwise be answered with two street addresses and no
  // email. Nothing in RX.contact matches "where"/"office"/"hq", so the reverse
  // mistake cannot happen.
  if (has(text, RX.contact)) {
    log("contact");
    return answerContact(v);
  }
  if (has(text, RX.locations)) {
    log("locations");
    return answerLocations(v);
  }
  if (has(text, RX.clients)) {
    log("clients");
    return answerClients(v);
  }
  if (has(text, RX.industries)) {
    log("industries");
    return answerIndustries(v);
  }
  if (has(text, RX.why)) {
    log("why_consult_america");
    return answerWhy(v);
  }

  const services = matchServices(text);
  if (services.length > 0 && services.length <= 3) {
    log("service");
    return answerServices(v, services);
  }

  for (const [rx, topic] of CAPABILITY_RX) {
    if (has(text, rx)) {
      log(topic);
      return answerCapability(v, topic);
    }
  }

  const industry = INDUSTRIES.find(([name]) =>
    text.includes(` ${name.toLowerCase()} `),
  );
  if (industry) {
    log("industry");
    return answerIndustry(v, industry);
  }

  if (has(text, RX.howWeWork)) {
    log("how_we_work");
    return answerHowWeWork(v);
  }
  if (has(text, RX.overview)) {
    log("overview");
    return answerOverview(v);
  }
  if (has(text, RX.offerings)) {
    log("offerings");
    return answerOfferings(v);
  }

  log("unknown");
  return reply(pick(v.seed, 35, UNKNOWN_ANSWERS), [
    TALK_TO_EXPERT,
    ABOUT_LINK,
    JOBS_LINK,
  ]);
}
