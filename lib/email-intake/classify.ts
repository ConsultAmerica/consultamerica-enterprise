/**
 * Deterministic first-pass classification. Confident rule matches skip the AI;
 * everything else is "ambiguous" and goes to the AI classifier (if configured)
 * and, whatever the result, to human review. Classification never publishes.
 */

import type { ClassificationResult, IntakeClassification } from "@/lib/email-intake/types";

export const CONFIDENT = 0.8;

type Rule = { pattern: RegExp; weight: number; reason: string };

const JOB_SIGNALS: Rule[] = [
  { pattern: /\b(job|position|role|opening|requirement|req)\b.{0,40}\b(description|details|available|open|needed)\b/i, weight: 2, reason: "describes an open position" },
  { pattern: /\b(looking for|need|seeking|hiring)\b.{0,12}\b(an?|one|two|\d+)?\s*(senior|sr\.?|junior|jr\.?|lead|principal)?\s*[a-z/ .+-]{2,40}\b(developer|engineer|consultant|analyst|architect|administrator|manager|specialist|lead)\b/i, weight: 3, reason: "requests a specific role" },
  { pattern: /\b(developer|engineer|consultant|analyst|architect)\s+(needed|required|wanted)\b/i, weight: 3, reason: "role needed" },
  { pattern: /\b(must have|required skills|requirements:|qualifications|responsibilities|nice to have)\b/i, weight: 2, reason: "lists requirements" },
  { pattern: /\b\d+\+?\s*(years|yrs)\b.{0,20}\bexperience\b/i, weight: 1, reason: "states experience" },
  { pattern: /\b(c2c|w2|corp[- ]to[- ]corp|contract[- ]to[- ]hire|full[- ]time|part[- ]time|duration)\b/i, weight: 1, reason: "states engagement terms" },
  { pattern: /\b(hybrid|remote|onsite|on-site)\b/i, weight: 1, reason: "states work arrangement" },
  { pattern: /\b(job description|jd)\b/i, weight: 1, reason: "mentions a job description" },
];

const UPDATE_SIGNALS: Rule[] = [
  { pattern: /\b(update|updated|change|changed|revised|correction|instead|make that|now (?:is|it's)|no longer)\b/i, weight: 2, reason: "amends earlier details" },
];

const CANDIDATE_SIGNALS: Rule[] = [
  { pattern: /\b(resume|cv)\b.{0,30}\b(attached|enclosed|for your review)\b/i, weight: 3, reason: "submits a resume" },
  { pattern: /\b(submitting|submission of|presenting)\b.{0,20}\b(candidate|consultant|profile)\b/i, weight: 3, reason: "submits a candidate" },
  { pattern: /\bcandidate (profile|details|summary)\b/i, weight: 2, reason: "candidate profile" },
];

const NON_RECRUITING_SIGNALS: Rule[] = [
  { pattern: /\b(unsubscribe|newsletter|webinar|view in browser)\b/i, weight: 3, reason: "marketing email" },
  { pattern: /\b(invoice|receipt|payment (?:due|received)|order confirmation)\b/i, weight: 3, reason: "billing email" },
  { pattern: /\b(password reset|verify your (?:email|account)|security alert|sign-in attempt)\b/i, weight: 3, reason: "account notification" },
  { pattern: /\b(out of office|automatic reply|auto-reply)\b/i, weight: 3, reason: "automatic reply" },
];

function score(text: string, rules: Rule[]): { score: number; reasons: string[] } {
  let total = 0;
  const reasons: string[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      total += rule.weight;
      reasons.push(rule.reason);
    }
  }
  return { score: total, reasons };
}

export type RuleClassification = ClassificationResult & { ambiguous: boolean };

export function classifyByRules(input: {
  subject: string | null;
  text: string;
  /** True when an earlier message in the same provider thread was a job requirement. */
  threadHasJobRequirement: boolean;
  attachmentNames: string[];
}): RuleClassification {
  const subject = input.subject ?? "";
  const haystack = `${subject}\n${input.text.slice(0, 8000)}`;
  const isReply = /^\s*(re|fw|fwd)\s*:/i.test(subject);

  const job = score(haystack, JOB_SIGNALS);
  const update = score(haystack, UPDATE_SIGNALS);
  const candidate = score(haystack, CANDIDATE_SIGNALS);
  const other = score(haystack, NON_RECRUITING_SIGNALS);
  if (input.attachmentNames.some((n) => /\b(resume|cv)\b/i.test(n))) {
    candidate.score += 2;
    candidate.reasons.push("resume attachment");
  }

  const result = (classification: IntakeClassification, confidence: number, reasons: string[]): RuleClassification => ({
    classification,
    confidence,
    source: "RULES",
    reasons,
    ambiguous: confidence < CONFIDENT,
  });

  if (input.threadHasJobRequirement && (isReply || update.score > 0) && candidate.score < 3) {
    return result("JOB_UPDATE", update.score > 0 ? 0.85 : 0.7, [
      "reply in a thread that already contains a job requirement",
      ...update.reasons,
    ]);
  }
  if (other.score >= 3 && job.score < 2) return result("NON_RECRUITING", 0.9, other.reasons);
  if (candidate.score >= 3 && candidate.score >= job.score) return result("CANDIDATE_SUBMISSION", 0.85, candidate.reasons);
  if (job.score >= 5) return result("JOB_REQUIREMENT", 0.9, job.reasons);
  if (job.score >= 3) return result("JOB_REQUIREMENT", 0.7, job.reasons);
  if (job.score > 0 || candidate.score > 0) return result("GENERAL_RECRUITING", 0.5, [...job.reasons, ...candidate.reasons]);
  return result("UNKNOWN", 0.3, ["no recruiting signals found"]);
}
