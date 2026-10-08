"use server";

import { headers } from "next/headers";

import { checkPublicRateLimit, clientIp } from "@/lib/assistant/rate-limit";
import { extractDocumentText } from "@/lib/documents/text-extraction";
import { parseResumeByRules } from "@/lib/recruiting/resume-parser";
import { validateCandidateDocumentFile } from "@/lib/storage/candidate-documents";

export type ResumePrefill = {
  contact: { firstName: string; lastName: string; email: string; phone: string; location: string; linkedin: string };
  summary: string;
  skills: string[];
  experience: { title: string; company: string; startDate: string; endDate: string; isCurrent: boolean }[];
  education: { institution: string; degree: string; fieldOfStudy: string; endDate: string }[];
  certifications: string[];
};

/**
 * Detailed Apply prefill. Anonymous, so it is rate-limited and uses only the
 * deterministic parser (no paid AI calls). Nothing is stored: the candidate
 * reviews and edits the suggestions, and only the submitted application
 * persists anything. Values come only from the resume text.
 */
export async function parseResumeForPrefill(formData: FormData): Promise<{ ok: true; prefill: ResumePrefill } | { ok: false; error: string }> {
  const decision = await checkPublicRateLimit("resume-prefill", clientIp(await headers()));
  if (!decision.allowed) return { ok: false, error: "Too many resume uploads right now. You can still fill in your details manually." };

  const file = formData.get("resume");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Please choose a resume file." };
  const validation = validateCandidateDocumentFile({ fileName: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size });
  if (!validation.ok) return { ok: false, error: validation.error };

  const extracted = await extractDocumentText({ fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  if (!extracted.ok) {
    return { ok: false, error: "We couldn't read text from this file, but you can still apply — fill in your details below." };
  }

  const parsed = parseResumeByRules(extracted.text);
  const [firstName = "", ...rest] = (parsed.contact.name ?? "").split(" ");
  return {
    ok: true,
    prefill: {
      contact: {
        firstName,
        lastName: rest.join(" "),
        email: parsed.contact.email ?? "",
        phone: parsed.contact.phone ?? "",
        location: parsed.contact.location ?? "",
        linkedin: parsed.contact.linkedin ?? "",
      },
      summary: parsed.summary ?? "",
      skills: parsed.skills.map((s) => s.name),
      experience: parsed.experience.slice(0, 15).map((e) => ({
        title: e.title ?? "",
        company: e.company ?? "",
        startDate: e.startDate ?? "",
        endDate: e.endDate ?? "",
        isCurrent: e.isCurrent,
      })),
      education: parsed.education.slice(0, 8).map((e) => ({
        institution: e.institution ?? "",
        degree: e.degree ?? "",
        fieldOfStudy: e.fieldOfStudy ?? "",
        endDate: e.endDate ?? "",
      })),
      certifications: parsed.certifications.slice(0, 15).map((c) => c.name),
    },
  };
}
