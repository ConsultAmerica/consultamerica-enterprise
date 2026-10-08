/**
 * Deterministic job extraction used when no AI provider is configured (and in
 * mock mode). It only returns values it can quote from the email, so its
 * output passes the same evidence gate as the AI extractor. It deliberately
 * extracts less rather than guessing.
 */

import type { RawExtractedField } from "@/lib/email-intake/extraction";
import type { IntakeAI } from "@/lib/email-intake/pipeline";
import type { ExtractionFieldKey } from "@/lib/email-intake/types";
import { findSkills } from "@/lib/recruiting/skill-taxonomy";

export const RULES_EXTRACTOR_MODEL = "rules-extractor/1";

const field = (value: string | string[], evidence: string, status: "EXPLICIT" | "INFERRED" = "EXPLICIT", source = "body"): RawExtractedField => ({
  value,
  status,
  evidence,
  source,
  confidence: status === "EXPLICIT" ? 0.8 : 0.55,
});

const ROLE = "(?:developer|engineer|consultant|analyst|architect|administrator|manager|specialist|lead|tester)";

function firstMatch(text: string, regex: RegExp): RegExpExecArray | null {
  regex.lastIndex = 0;
  return regex.exec(text);
}

function lineAfter(text: string, label: RegExp): { value: string; evidence: string } | null {
  for (const line of text.split("\n")) {
    const m = label.exec(line);
    if (m && m.index !== undefined) {
      const value = line.slice(m.index + m[0].length).trim().replace(/^[:\-–]\s*/, "");
      if (value) return { value, evidence: line.trim() };
    }
  }
  return null;
}

export function extractJobByRules(input: { subject: string | null; body: string; attachments: string }): Partial<Record<ExtractionFieldKey, RawExtractedField>> {
  const subject = input.subject ?? "";
  const text = [input.body, input.attachments].filter(Boolean).join("\n");
  const out: Partial<Record<ExtractionFieldKey, RawExtractedField>> = {};

  // Title: "looking for an X in", "Need a X", "X Needed", "Requirement: X".
  const bodyTitle = firstMatch(text, new RegExp(`\\b(?:looking for|need|seeking|hiring)\\s+(?:an?\\s+)?((?:senior |sr\\.? |junior |lead |principal )?[A-Za-z/+.# -]{2,50}?${ROLE})\\b`, "i"));
  const subjectTitle =
    firstMatch(subject, new RegExp(`^(?:re:\\s*|fwd?:\\s*)*(?:requirement:\\s*)?((?:senior |sr\\.? |junior |lead )?[A-Za-z/+.# -]{2,50}?${ROLE})\\b`, "i"));
  if (bodyTitle) out.title = field(bodyTitle[1].trim(), bodyTitle[0]);
  else if (subjectTitle) out.title = field(subjectTitle[1].trim(), subjectTitle[0], "EXPLICIT", "subject");
  else {
    const attTitle = input.attachments.split("\n").map((l) => l.trim()).find((l) => new RegExp(`${ROLE}$`, "i").test(l) && l.length < 60);
    if (attTitle) out.title = field(attTitle, attTitle, "EXPLICIT", "attachment");
  }

  const loc = lineAfter(text, /^\s*location\s*/i);
  const inCity = firstMatch(text, /\bin ([A-Z][a-zA-Z.]+(?: [A-Z][a-zA-Z.]+)*, [A-Z]{2})\b/);
  if (loc) out.location = field(loc.value, loc.evidence);
  else if (inCity) out.location = field(inCity[1], inCity[0]);

  // First arrangement word that is not negated ("remote instead of hybrid" → Remote).
  const arrangementWord = /\b(remote|hybrid|on-?site)\b/gi;
  for (let m = arrangementWord.exec(text); m; m = arrangementWord.exec(text)) {
    const before = text.slice(Math.max(0, m.index - 16), m.index).toLowerCase();
    if (/(instead of|rather than|no longer|not)\s*$/.test(before)) continue;
    const start = Math.max(text.lastIndexOf(".", m.index), text.lastIndexOf("\n", m.index)) + 1;
    const ends = [text.indexOf(".", m.index), text.indexOf("\n", m.index)].filter((i) => i >= 0);
    const end = ends.length ? Math.min(...ends) : text.length;
    const word = m[1].toLowerCase();
    out.workArrangement = field(word === "remote" ? "Remote" : word === "hybrid" ? "Hybrid" : "On-site", text.slice(start, end).trim());
    break;
  }

  const employment = lineAfter(text, /^\s*employment type\s*/i);
  const employmentWord = firstMatch(text, /\b(contract[- ]to[- ]hire|full[- ]time|part[- ]time|contract)\b/i);
  if (employment) out.employmentType = field(employment.value, employment.evidence);
  else if (employmentWord) out.employmentType = field(employmentWord[1], employmentWord[0]);

  const duration = lineAfter(text, /^\s*duration\s*/i);
  if (duration) out.duration = field(duration.value, duration.evidence);

  const years = firstMatch(text, /\b(\d{1,2})\+?\s*(?:years|yrs)\b[^.\n]{0,40}/i);
  if (years) out.minimumExperience = field(`${years[1]}+ years`, years[0].trim());

  const reference = firstMatch(text, /\b(?:reference|ref|req(?:uisition)?(?: ?(?:#|no\.?|id))?)\s*[:#]\s*([A-Z0-9][A-Z0-9-]{2,30})/i);
  if (reference) out.clientReference = field(reference[1], reference[0]);

  const preferredLine = text.split("\n").find((l) => /\b(nice to have|preferred)\b/i.test(l)) ?? "";
  const preferred = preferredLine ? findSkills(preferredLine) : [];
  const requiredNames = new Set(findSkills(text.replace(preferredLine, " ")).map((s) => s.name));
  // Evidence is always quoted from the original text so it passes the evidence gate.
  const required = findSkills(text).filter((s) => requiredNames.has(s.name) && !preferred.some((p) => p.name === s.name));
  if (required.length) out.requiredSkills = field(required.map((s) => s.name), required[0].evidence, "INFERRED");
  if (preferred.length) out.preferredSkills = field(preferred.map((s) => s.name), preferredLine.trim(), "INFERRED");

  const lead = firstMatch(text, /[^.\n]*\b(?:looking for|requirement for|need)\b[^.\n]*\./i);
  if (lead) out.description = field(lead[0].trim(), lead[0].trim(), "INFERRED");

  return out;
}

/** IntakeAI-compatible extractor without an AI classifier (rules already classified). */
export function createRulesIntakeExtractor(): IntakeAI {
  return {
    model: RULES_EXTRACTOR_MODEL,
    async extract(input) {
      return extractJobByRules(input);
    },
  };
}
