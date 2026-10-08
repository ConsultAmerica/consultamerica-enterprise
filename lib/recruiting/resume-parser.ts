/**
 * Resume parser: extracted text → structured, evidence-backed profile.
 *
 * Every item carries `evidence` — a snippet that appears in the resume text.
 * Rules always run (contact details, taxonomy skills, dated roles, degrees,
 * certifications). When an AI parser is configured its items are added only
 * if their evidence quote is found in the text; anything unverifiable is
 * dropped. Nothing is inferred: missing data stays missing.
 */

import { canonical } from "@/lib/email-intake/normalize";
import { canonicalSkill, findSkills, SKILLS } from "@/lib/recruiting/skill-taxonomy";

export const RESUME_PARSER_VERSION = "resume-parser/1";

export type EvidenceItem = { name: string; evidence: string };

export type ResumeExperience = {
  title: string | null;
  company: string | null;
  startDate: string | null; // YYYY-MM or YYYY
  endDate: string | null;
  isCurrent: boolean;
  evidence: string;
};

export type ResumeEducation = {
  institution: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  endDate: string | null;
  evidence: string;
};

export type ParsedResume = {
  contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    linkedin: string | null;
  };
  summary: string | null;
  skills: EvidenceItem[];
  technologies: EvidenceItem[];
  titles: string[];
  employers: string[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  certifications: EvidenceItem[];
  /** Sum of non-overlapping dated roles; null when no role has usable dates. */
  totalYearsExperience: number | null;
  warnings: string[];
};

export type ResumeAIOutput = {
  name?: unknown;
  location?: unknown;
  summary?: unknown;
  skills?: unknown;
  experience?: unknown;
  education?: unknown;
  certifications?: unknown;
};

export type ResumeAI = {
  model: string;
  parse(text: string): Promise<ResumeAIOutput>;
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
};
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}/\\d{4}|\\d{4})`;
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(present|current|now|${DATE})`, "i");
const TECH_CATEGORIES = new Set(["integration", "data", "cloud", "language", "engineering"]);

function normalizeDate(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  let m = /^([a-z]+)\.?\s+(\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[m[1].slice(0, 3)];
    return month ? `${m[2]}-${month}` : m[2];
  }
  m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = /^(\d{4})$/.exec(s);
  return m ? m[1] : null;
}

function monthIndex(date: string, end: boolean): number {
  const [y, mo] = date.split("-");
  return Number(y) * 12 + (mo ? Number(mo) - 1 : end ? 11 : 0);
}

export function totalYears(experience: ResumeExperience[], now: Date = new Date()): number | null {
  const ranges = experience
    .filter((e) => e.startDate)
    .map((e) => {
      const start = monthIndex(e.startDate as string, false);
      const end = e.isCurrent || !e.endDate ? now.getFullYear() * 12 + now.getMonth() : monthIndex(e.endDate, true);
      return [start, Math.max(start, end)] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  if (!ranges.length) return null;
  let months = 0;
  let [curStart, curEnd] = ranges[0];
  for (const [s, e] of ranges.slice(1)) {
    if (s <= curEnd) curEnd = Math.max(curEnd, e);
    else {
      months += curEnd - curStart + 1;
      [curStart, curEnd] = [s, e];
    }
  }
  months += curEnd - curStart + 1;
  return Math.round((months / 12) * 10) / 10;
}

function lines(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Splits "Senior Consultant, Acme Corp" / "Senior Consultant at Acme" / "Acme | Senior Consultant". */
function splitRole(line: string): { title: string | null; company: string | null } {
  const cleaned = line.replace(RANGE, "").replace(/[()|,–—-]\s*$/, "").trim();
  const at = /^(.+?)\s+(?:at|@)\s+(.+)$/i.exec(cleaned);
  if (at) return { title: at[1].trim(), company: at[2].trim() };
  const parts = cleaned.split(/\s*(?:\||,|–|—| - )\s*/).filter(Boolean);
  if (parts.length >= 2) return { title: parts[0], company: parts[1] };
  return { title: cleaned || null, company: null };
}

const DEGREE = /\b(bachelor(?:'s)?|master(?:'s)?|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?b\.?a\.?|mba|ph\.?d\.?|b\.?tech|m\.?tech|b\.?e\.?|associate(?:'s)? degree|doctorate)\b/i;
const INSTITUTION = /\b(university|college|institute|school of)\b/i;
const CERT = /\b(certified|certification|certificate)\b/i;

export function parseResumeByRules(text: string): ParsedResume {
  const all = lines(text);
  const email = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text)?.[0] ?? null;
  const phone = /(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.exec(text)?.[0] ?? null;
  const linkedin = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i.exec(text)?.[0] ?? null;
  const nameLine = all.slice(0, 3).find((l) => /^[A-Z][a-zA-Z'.-]+(?: [A-Z][a-zA-Z'.-]+){1,3}$/.test(l) && !DEGREE.test(l));
  const locationLine = all.slice(0, 8).map((l) => /\b([A-Z][a-zA-Z.]+(?: [A-Z][a-zA-Z.]+)*, [A-Z]{2})\b/.exec(l)?.[1]).find(Boolean) ?? null;

  const skills = findSkills(text).map((h) => ({ name: h.name, evidence: h.evidence }));

  const experience: ResumeExperience[] = [];
  for (let i = 0; i < all.length; i++) {
    const range = RANGE.exec(all[i]);
    if (!range) continue;
    const rest = all[i].replace(RANGE, "").trim();
    const roleLine = rest.length > 3 ? rest : all[i - 1] ?? "";
    if (!roleLine || DEGREE.test(roleLine) || INSTITUTION.test(roleLine)) continue;
    const { title, company } = splitRole(roleLine);
    const current = /present|current|now/i.test(range[2]);
    experience.push({
      title,
      company,
      startDate: normalizeDate(range[1]),
      endDate: current ? null : normalizeDate(range[2]),
      isCurrent: current,
      evidence: rest.length > 3 ? all[i] : `${roleLine}\n${all[i]}`,
    });
  }

  const education: ResumeEducation[] = [];
  for (const [i, line] of all.entries()) {
    if (!DEGREE.test(line)) continue;
    const institutionLine = INSTITUTION.test(line) ? line : [all[i - 1], all[i + 1]].find((l) => l && INSTITUTION.test(l)) ?? null;
    const year = /\b(19|20)\d{2}\b/.exec(line)?.[0] ?? null;
    const field = /\b(?:in|of)\s+([A-Z][A-Za-z &]+)/.exec(line)?.[1]?.trim() ?? null;
    education.push({
      institution: institutionLine ? (institutionLine.split(/,|–|—| - |\|/)[0] ?? "").trim() || null : null,
      degree: DEGREE.exec(line)?.[0] ?? null,
      fieldOfStudy: field,
      endDate: year,
      evidence: institutionLine && institutionLine !== line ? `${line}\n${institutionLine}` : line,
    });
  }

  const certifications = all
    .filter((l) => CERT.test(l) && l.length < 160)
    .map((l) => ({ name: l.replace(/^[•\-*]\s*/, ""), evidence: l }));

  const summaryLine = all.find((l) => l.length > 80 && /\b(experience|consultant|engineer|professional|specialist)\b/i.test(l)) ?? null;

  return finalize({
    contact: {
      name: nameLine ?? null,
      email: email?.toLowerCase() ?? null,
      phone,
      location: locationLine,
      linkedin,
    },
    summary: summaryLine,
    skills,
    technologies: [],
    titles: [],
    employers: [],
    experience,
    education,
    certifications,
    totalYearsExperience: null,
    warnings: experience.length ? [] : ["No dated work history was recognized; experience is shown as unknown."],
  });
}

function finalize(parsed: ParsedResume): ParsedResume {
  const techNames = new Set(SKILLS.filter((s) => TECH_CATEGORIES.has(s.category)).map((s) => s.name));
  return {
    ...parsed,
    technologies: parsed.skills.filter((s) => techNames.has(s.name)),
    titles: [...new Set(parsed.experience.map((e) => e.title).filter((t): t is string => Boolean(t)))],
    employers: [...new Set(parsed.experience.map((e) => e.company).filter((c): c is string => Boolean(c)))],
    totalYearsExperience: totalYears(parsed.experience),
  };
}

const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Keeps only AI items whose evidence quote appears in the resume text. */
export function mergeAIParse(rules: ParsedResume, ai: ResumeAIOutput, text: string): ParsedResume {
  const corpus = canonical(text);
  const verified = (evidence: unknown) => {
    const e = str(evidence, 400);
    return e && corpus.includes(canonical(e)) ? e : null;
  };
  const warnings = [...rules.warnings];
  let dropped = 0;

  const skills = new Map(rules.skills.map((s) => [s.name, s]));
  for (const item of Array.isArray(ai.skills) ? ai.skills : []) {
    const name = str((item as { name?: unknown }).name, 80);
    const evidence = verified((item as { evidence?: unknown }).evidence);
    if (!name || !evidence) {
      dropped++;
      continue;
    }
    const key = canonicalSkill(name);
    if (!skills.has(key)) skills.set(key, { name: key, evidence });
  }

  const experience: ResumeExperience[] = [];
  for (const item of Array.isArray(ai.experience) ? ai.experience : []) {
    const e = item as Record<string, unknown>;
    const evidence = verified(e.evidence);
    if (!evidence) {
      dropped++;
      continue;
    }
    const start = str(e.startDate, 20);
    const end = str(e.endDate, 20);
    experience.push({
      title: str(e.title),
      company: str(e.company),
      startDate: start ? normalizeDate(start) ?? (/^\d{4}-\d{2}$/.test(start) ? start : null) : null,
      endDate: end ? normalizeDate(end) ?? (/^\d{4}-\d{2}$/.test(end) ? end : null) : null,
      isCurrent: e.isCurrent === true,
      evidence,
    });
  }

  const education: ResumeEducation[] = [];
  for (const item of Array.isArray(ai.education) ? ai.education : []) {
    const e = item as Record<string, unknown>;
    const evidence = verified(e.evidence);
    if (!evidence) {
      dropped++;
      continue;
    }
    education.push({ institution: str(e.institution), degree: str(e.degree), fieldOfStudy: str(e.fieldOfStudy), endDate: str(e.endDate, 20), evidence });
  }

  const certifications = [...rules.certifications];
  for (const item of Array.isArray(ai.certifications) ? ai.certifications : []) {
    const name = str((item as { name?: unknown }).name, 160);
    const evidence = verified((item as { evidence?: unknown }).evidence);
    if (!name || !evidence) {
      dropped++;
      continue;
    }
    if (!certifications.some((c) => canonical(c.name) === canonical(name))) certifications.push({ name, evidence });
  }

  if (dropped) warnings.push(`${dropped} AI-suggested item(s) were discarded because they could not be found in the resume text.`);
  const aiName = str(ai.name, 120);
  const aiLocation = str(ai.location, 120);
  const aiSummary = str(ai.summary, 1200);

  return finalize({
    contact: {
      ...rules.contact,
      name: rules.contact.name ?? (aiName && corpus.includes(canonical(aiName)) ? aiName : null),
      location: rules.contact.location ?? (aiLocation && corpus.includes(canonical(aiLocation)) ? aiLocation : null),
    },
    // An AI summary is a paraphrase; keep it only if it is verbatim text from the resume.
    summary: aiSummary && corpus.includes(canonical(aiSummary)) ? aiSummary : rules.summary,
    skills: [...skills.values()],
    technologies: [],
    titles: [],
    employers: [],
    experience: experience.length ? experience : rules.experience,
    education: education.length ? education : rules.education,
    certifications,
    totalYearsExperience: null,
    warnings: experience.length ? warnings.filter((w) => !w.startsWith("No dated work history")) : warnings,
  });
}

export async function parseResumeText(
  text: string,
  ai: ResumeAI | null,
): Promise<{ parsed: ParsedResume; parserVersion: string }> {
  const rules = parseResumeByRules(text);
  if (!ai) return { parsed: rules, parserVersion: `${RESUME_PARSER_VERSION}+rules` };
  try {
    const out = await ai.parse(text);
    return { parsed: mergeAIParse(rules, out, text), parserVersion: `${RESUME_PARSER_VERSION}+${ai.model}` };
  } catch {
    return {
      parsed: { ...rules, warnings: [...rules.warnings, "AI parsing was unavailable; rule-based parsing was used."] },
      parserVersion: `${RESUME_PARSER_VERSION}+rules`,
    };
  }
}
