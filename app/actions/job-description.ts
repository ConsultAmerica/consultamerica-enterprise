"use server";

import { revalidatePath } from "next/cache";

import { assertRecruitingStaff } from "@/lib/auth/recruiting";
import { assessJobCompleteness, linesFrom } from "@/lib/jobs/completeness";
import { recruitingRepository } from "@/lib/recruiting";

/**
 * Recruiter edits to a job description. Re-checks recruiting-staff
 * authorization (server actions are callable directly). Saves the requisition
 * and, when one exists, its posting's text — it never publishes, unpublishes
 * or changes a posting's status or publication dates.
 */

export type JobDescriptionState = { ok: boolean | null; message: string | null; ready?: boolean };

const LIMITS = { summary: 300, description: 8000, line: 400, lines: 25 } as const;

function text(form: FormData, name: string, max: number): string {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

function list(form: FormData, name: string): string[] {
  return linesFrom(form.get(name))
    .slice(0, LIMITS.lines)
    .map((line) => line.slice(0, LIMITS.line));
}

export async function saveJobDescriptionAction(
  requisitionId: string,
  _prev: JobDescriptionState,
  form: FormData,
): Promise<JobDescriptionState> {
  try {
    await assertRecruitingStaff();
  } catch {
    return { ok: false, message: "You don't have access to edit jobs." };
  }

  const deadline = text(form, "applicationDeadline", 10);
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return { ok: false, message: "Use a valid closing date." };
  }
  const input = {
    summary: text(form, "summary", LIMITS.summary),
    description: text(form, "description", LIMITS.description),
    responsibilities: list(form, "responsibilities"),
    qualifications: list(form, "qualifications"),
    preferredQualifications: list(form, "preferredQualifications"),
    experienceLevel: text(form, "experienceLevel", 40) || undefined,
    // End of the chosen day in UTC, so a role closes after its last full day.
    applicationDeadline: deadline ? `${deadline}T23:59:59.000Z` : "",
  };
  if (!input.description) return { ok: false, message: "About the role can't be empty." };

  try {
    const saved = await recruitingRepository.updateJobDescription(requisitionId, input);
    if (!saved) return { ok: false, message: "This requisition no longer exists." };
    const posting = await recruitingRepository.getPostingForRequisition(requisitionId);
    revalidatePath(`/app/recruiting/jobs/${requisitionId}`);
    revalidatePath("/jobs");
    if (posting?.slug) revalidatePath(`/jobs/${posting.slug}`);
    const { ready } = assessJobCompleteness({ ...input, locationName: posting?.locationName });
    console.info("[job-description]", { event: "saved", requisitionId, postingUpdated: saved.postingUpdated, ready });
    return {
      ok: true,
      ready,
      message: saved.postingUpdated
        ? "Saved. The posting text is updated; its publication status is unchanged."
        : "Saved to the requisition. It has no posting yet.",
    };
  } catch (error) {
    console.error("[job-description]", { event: "save-failed", requisitionId, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
