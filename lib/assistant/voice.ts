/**
 * How the deterministic assistant sounds.
 *
 * lib/assistant/deterministic.ts decides WHAT a visitor is told. This module
 * decides how it reads. Two rules shape everything in here:
 *
 *  1. Nothing in this file may introduce a company fact. The phrase banks are
 *     pure connective tissue (openers, bridges, closings, hand-offs) and the
 *     helpers only reshape text that already arrived from an approved module.
 *     That separation is the whole reason a chatty assistant stays as safe as a
 *     canned one: there is no code path where prose and facts are authored
 *     together.
 *  2. Nothing may be random. A visitor re-asking a question, a reviewer reading
 *     a transcript, and a unit test all have to see the same words, so every
 *     choice is a hash of the conversation rather than Math.random.
 */

import type { AssistantTurn } from "@/lib/assistant/engine";

// ------------------------------------------------------- deterministic choice

/**
 * FNV-1a, 32-bit. Four lines, no dependency, and it spreads short strings
 * evenly enough that two similarly worded questions land on different
 * phrasings. Nothing here is security sensitive.
 */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    h ^= text.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The seed for one reply.
 *
 * It folds in how many questions have been asked as well as the question
 * itself. That is what stops a visitor who asks the same thing twice in one
 * session from getting a verbatim repeat, while a fresh session asking the same
 * question still reproduces exactly: the seed is a pure function of the request
 * body, which is also what makes it testable.
 */
export function replySeed(turns: AssistantTurn[]): number {
  const asked = turns.filter((turn) => turn.role === "user");
  const last = asked[asked.length - 1]?.content ?? "";
  return hash(`${asked.length}:${last.trim().toLowerCase()}`);
}

/**
 * One answer makes several independent choices (an opener, a bridge, a
 * closing). Reusing the raw seed for all of them would correlate them, so each
 * choice declares a `slot` and gets its own avalanche of the seed first.
 */
function mix(seed: number, slot: number): number {
  let h = (seed ^ Math.imul(slot + 1, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

/** Stable pick: same seed and slot always return the same option. */
export function pick<T>(seed: number, slot: number, options: readonly T[]): T {
  return options[mix(seed, slot) % options.length];
}

// -------------------------------------------------------------- text shaping

/**
 * Independent-clause test for `noEmDash`. A dash followed by a conjunction, a
 * preposition, or a participle is continuing the same sentence, so a comma is
 * correct there; anything else is usually a second clause that can stand on its
 * own. The participle case matters most: the approved copy uses the dash that
 * way repeatedly ("…, operationalized with the data foundations", "…, connecting
 * Oracle Cloud"), and breaking the sentence there leaves a dangling fragment.
 */
const CONTINUES_SENTENCE =
  /^(and|but|or|nor|so|yet|with|without|from|for|to|then|than|plus|not|including|while|whether|because|after|before|unless|\w+(ing|ed))\b/i;

/**
 * Removes em and en dashes from approved copy.
 *
 * Several approved strings in components/marketing/company-copy.ts still use
 * " — ", and the Consult America voice forbids an em dash in anything a visitor
 * reads. Paraphrasing the sentence would risk drifting off the approved fact,
 * so only the punctuation changes: a comma where the following clause cannot
 * stand alone ("and keep growing while they do it"), otherwise a sentence break
 * with the next word capitalised, because "your resume, it carries your history"
 * is a comma splice while "your resume. It carries your history" is not. The
 * final sweep catches an unspaced dash so no code path can leak one.
 */
export function noEmDash(text: string): string {
  return text
    .replace(/ +[—–] +(\S)(\S*)/g, (_match, first: string, rest: string) =>
      CONTINUES_SENTENCE.test(`${first}${rest}`)
        ? `, ${first}${rest}`
        : `. ${first.toUpperCase()}${rest}`,
    )
    .replace(/[—–]/g, ", ");
}

/**
 * Proper nouns and acronyms that must keep their capital when an approved
 * sentence is spliced into the middle of one of ours. Lowercasing "Oracle" or
 * "AI" would change a name, and changing a name counts as changing the fact.
 */
const KEEPS_CAPITAL =
  /^(Oracle|AI|ERP|HCM|SCM|EPM|OCI|SLAs?|GenAI|API|APIs|Consult|America|Kubernetes|Terraform|Postgres|SRE|RPA|Python|SQL|US|U|Northern)$/;

/**
 * Approved copy is written to open a sentence, so quoting it after a colon
 * ("one of five practices: Migrate and modernize…") reads like two sentences
 * glued together. Dropping the initial capital fixes the seam, except where the
 * first word is a name or an acronym.
 */
export function lowerFirst(text: string): string {
  const first = text.match(/^[A-Za-z]+/)?.[0];
  if (!first || KEEPS_CAPITAL.test(first) || /^[A-Z]{2,}/.test(first)) {
    return text;
  }
  return text[0].toLowerCase() + text.slice(1);
}

export function upperFirst(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
] as const;

/** "two offices" reads better than "2 offices" in prose; digits win above ten. */
export function numberWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

/** "a, b and c" — an Oxford comma would be the only comma in most of these. */
export function listify(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** One paragraph: drops the parts an answer chose not to include. */
export function para(...parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Stacked blocks (lead line, list, closing line). `.cmdk-reply` is pre-line. */
export function block(...parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join("\n");
}

export function bullets(items: readonly string[]): string {
  return items.map((item) => `• ${noEmDash(item)}`).join("\n");
}

export function numbered(items: readonly string[]): string {
  return items.map((item, i) => `${i + 1}. ${noEmDash(item)}`).join("\n");
}

// --------------------------------------------------------------- phrase banks

export const GREETINGS = [
  "Hi. I can tell you what Consult America does, go through any of the five practices, cover the industries we work in and where the offices are, or pull up the roles that are open right now.",
  "Hello. Ask me about the company itself, a particular service, the sectors we focus on, careers, or what is on the job board today.",
  "Hey. Good places to start: what Consult America actually does, one of the service lines, where we are based, or the current openings.",
] as const;

/** Replies to "thanks" / "ok" partway through a conversation. */
export const ACKNOWLEDGEMENTS = [
  "Any time. Anything else you want to dig into?",
  "Glad that helped. Ask away if something else comes up.",
  "No problem. Happy to keep going if you have another question.",
] as const;

export const OVERVIEW_OPENERS = [
  "Short version:",
  "Here is the shape of it.",
  "In plain terms:",
] as const;

export const OVERVIEW_CLOSINGS = [
  "Tell me which of those is closest to what you are looking at and I can go deeper.",
  "Say the word on any one of them and I will get specific.",
  "Pick whichever one matters to you and I will break it down.",
] as const;

export const OFFERINGS_OPENERS = [
  "We run five practices, and most engagements touch more than one of them:",
  "Five practices cover the work:",
  "Here is the whole set:",
] as const;

export const OFFERINGS_CLOSINGS = [
  "Each one breaks down into its own service lines, so name the area that matters and I will narrow it down.",
  "If one of those is close to what you have in mind, say which and I will point you at the service pages underneath it.",
  "Tell me the problem rather than the practice and I can work out which of these it lands in.",
] as const;

/**
 * Frames for "do you do X" about a whole practice. Each takes the practice
 * title and its approved body, already de-dashed and decapitalised, so the
 * frame contributes grammar and nothing else.
 */
export const CAPABILITY_FRAMES = [
  (title: string, body: string) =>
    `Yes, ${title} is one of our core practices: ${body}`,
  (title: string, body: string) =>
    `That lands squarely in our ${title} practice: ${body}`,
  (title: string, body: string) =>
    `${title} is one of the practices we run, and in practice that means: ${body}`,
] as const;

export const SERVICE_FRAMES = [
  (title: string, dek: string) =>
    `Yes, ${title} is one of our service lines: ${dek}`,
  (title: string, dek: string) =>
    `We have a service line for exactly that, ${title}: ${dek}`,
  (title: string, dek: string) => `${title} covers that: ${dek}`,
] as const;

export const SERVICE_CLOSINGS = [
  "Its page walks through what it covers, how an engagement runs and what you end up holding at the end.",
  "The page for it sets out the scope, the order the work happens in, and the deliverables.",
] as const;

/**
 * The three-move shape for a fact the company has not confirmed. A bare "I
 * can't confirm that" is a dead end: the visitor leaves with nothing and no
 * idea why. Each opener therefore names what is missing AND why it is missing,
 * before the answer hands over the nearest approved fact and the one route that
 * can actually settle it.
 *
 * All three put the missing thing before the reason. Leading with the reason
 * ("That is not part of the approved information, so…") strands the pronoun on
 * a subject the visitor has not been given yet.
 */
export const UNCONFIRMED_OPENERS = [
  (what: string, why: string) =>
    `Honest answer: I don't have ${what}, because ${why}. I would rather leave that blank than guess at it.`,
  (what: string, why: string) =>
    `I have to leave that one open: I don't have ${what}, since ${why}, and I am not going to invent it.`,
  (what: string, why: string) =>
    `Straight with you: I can't give you ${what}, because ${why}.`,
] as const;

export const UNCONFIRMED_BRIDGES = [
  "What I can tell you:",
  "What I do have:",
  "Here is what I can stand behind:",
] as const;

export const UNCONFIRMED_NEXT = [
  "If you need the part I left out, Talk to an expert reaches the team and they can answer it properly.",
  "The team can settle the rest in a sentence, and Talk to an expert is the route to them.",
  "For the gap, Talk to an expert goes straight to people who can confirm it.",
] as const;

/**
 * The nudge toward the enquiry form. It is a sentence, not a wall: the link is
 * already attached to most answers, so the copy only has to make the offer once
 * the visitor has shown they are researching properly or has asked something
 * only a human can price or scope.
 */
export const STEERS = [
  "If it would help to put this in front of a person, Talk to an expert goes straight to the team.",
  "At some point a short conversation beats a chat window, and Talk to an expert is the quickest way to get one.",
  "Happy to keep going here, though if you would rather talk it through, Talk to an expert reaches the team directly.",
  "When you want this against your own situation rather than in general, Talk to an expert is the right next step.",
] as const;

export const PRICING_ANSWERS = [
  "No published rates, I am afraid, and I am not going to invent one. Pricing is built per engagement rather than off a rate card, so it follows the scope of the work. Send a couple of lines about what you are trying to do through Talk to an expert and the team will come back with something specific.",
  "Fair question, and the honest answer is that there is no price list. Every engagement is scoped on its own, so the number depends on what is actually in it. Talk to an expert is the quickest way to a real figure: sketch the scope and the team follows up.",
  "I can't put a number on it, because none are published and the scope of each engagement is what sets the price. Tell the team roughly what you need through Talk to an expert and they can put figures against it.",
] as const;

export const BOOKING_ANSWERS = [
  "I can't book a call myself, no calendar access from in here, but I can get you to the people who can. Drop what you are trying to solve and how to reach you into Talk to an expert and the Consult America team will follow up.",
  "Short answer: I can't book calls from this chat. The Talk to an expert form is the way in, and a few details about your situation are enough for the team to pick it up.",
  "Afraid I can't book anything directly. What does work: leave your details and a line or two of context in Talk to an expert, and someone from the team comes back to you.",
] as const;

/** What the assistant is actually good for, used by the greeting and fallback. */
export const SUGGESTED_TOPICS =
  "what Consult America does, the Oracle, AI, engineering, transformation and managed services practices, the industries we work in, our offices, careers, and every role that is currently open";

export const UNKNOWN_ANSWERS = [
  `That one sits outside what I can answer from approved information, so I won't guess at it. What I do know well: ${SUGGESTED_TOPICS}. If your question is none of those, Talk to an expert reaches people who can answer it properly.`,
  `I don't have approved information on that, and making something up would not help you. Inside my range: ${SUGGESTED_TOPICS}. Anything beyond that is better asked through Talk to an expert.`,
  `Not something I can answer, I am afraid. What I can cover: ${SUGGESTED_TOPICS}. For the rest, the team picks up enquiries from Talk to an expert.`,
] as const;

/**
 * A detail the posting itself does not state. Recruiters, not this assistant,
 * are the right source for it, so each variant points there rather than
 * offering a guess or a range.
 */
export const JOB_SILENT_ON = [
  (what: string) =>
    `The posting doesn't say anything about ${what}, and I am not going to fill that in myself. The recruiting team can cover it once your application is in.`,
  // Phrased with the posting as the subject rather than `what`, because `what`
  // is sometimes plural ("benefits") and sometimes singular ("a salary").
  (what: string) =>
    `The posting is silent on ${what}. Worth asking the recruiting team directly when you apply.`,
  (what: string) =>
    `No mention of ${what} in this posting, so I will leave it rather than guess. Recruiters handle that kind of detail during the process.`,
] as const;
