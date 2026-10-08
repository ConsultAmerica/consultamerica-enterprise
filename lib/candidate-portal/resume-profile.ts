import type { DetailedProfile } from "@/lib/recruiting/detailed-profile";
import type { ParsedResume } from "@/lib/recruiting/resume-parser";

/**
 * Maps the parser's evidence-backed output to the editable profile shape used
 * by Detailed Apply and résumé-library corrections. The parser output itself
 * is never modified; corrections are stored beside it.
 */
export function profileFromParsed(parsed: ParsedResume | null): DetailedProfile {
  if (!parsed) return { summary: "", skills: [], experience: [], education: [], certifications: [], portfolioUrl: "" };
  return {
    summary: parsed.summary ?? "",
    skills: [...new Set(parsed.skills.map((s) => s.name))].slice(0, 60),
    experience: parsed.experience
      .filter((e) => e.title)
      .slice(0, 20)
      .map((e) => ({
        title: e.title ?? "",
        company: e.company ?? "",
        startDate: e.startDate ?? "",
        endDate: e.endDate ?? "",
        isCurrent: e.isCurrent,
      })),
    education: parsed.education.slice(0, 10).map((e) => ({
      institution: e.institution ?? "",
      degree: e.degree ?? "",
      fieldOfStudy: e.fieldOfStudy ?? "",
      endDate: e.endDate ?? "",
    })),
    certifications: parsed.certifications.map((c) => c.name).slice(0, 20),
    portfolioUrl: "",
  };
}

/** The candidate's corrected version wins; otherwise what the parser found. */
export function effectiveProfile(view: { parsed: ParsedResume | null; reviewed: DetailedProfile | null }): DetailedProfile {
  return view.reviewed ?? profileFromParsed(view.parsed);
}
