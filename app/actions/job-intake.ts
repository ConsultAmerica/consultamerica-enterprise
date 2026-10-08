"use server";

import { revalidatePath } from "next/cache";

import { syncEmailIntake } from "@/lib/email-intake/pipeline";
import { approveAsDraft, dismiss, linkToRequisition, saveReviewDraft } from "@/lib/email-intake/review";
import { getIntakeRuntime, intakeLog } from "@/lib/email-intake/runtime";
import { EXTRACTION_FIELDS, type ReviewDraft } from "@/lib/email-intake/types";
import { assertRecruitingStaff } from "@/lib/auth/recruiting";

/**
 * Job intake server actions. Every action re-checks recruiting-staff
 * authorization (server actions are callable directly, so the page guard is
 * not enough). None of these can publish a job.
 */

export type ActionResult = { ok: true; message?: string; requisitionId?: string } | { ok: false; error: string };

const actorOf = (a: Awaited<ReturnType<typeof assertRecruitingStaff>>) => ({ profileId: a.profileId, displayName: a.displayName });

async function authorized<T>(run: (actor: ReturnType<typeof actorOf>) => Promise<T>): Promise<T | ActionResult> {
  try {
    return await run(actorOf(await assertRecruitingStaff()));
  } catch (error) {
    if (error instanceof Error && error.name === "RecruitingAuthorizationError") return { ok: false, error: error.message };
    intakeLog({ event: "action-failed", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function syncIntakeNow(): Promise<ActionResult> {
  return authorized(async () => {
    const runtime = getIntakeRuntime();
    if (!runtime.provider) return { ok: false, error: "Mailbox sync is not configured (EMAIL_INTAKE_MODE)." } as ActionResult;
    const summary = await syncEmailIntake({
      provider: runtime.provider,
      repo: runtime.repo,
      ai: runtime.ai,
      recruiting: runtime.recruiting,
      workerId: `manual-${crypto.randomUUID()}`,
      initialSyncAfter: runtime.config.initialSyncAfter,
      allowedSenders: runtime.config.allowedSenders,
      log: intakeLog,
    });
    revalidatePath("/app/recruiting/job-intake");
    if (summary.status === "FAILED") return { ok: false, error: "The mailbox could not be reached. Nothing was skipped; try again later." } as ActionResult;
    if (summary.status === "LOCKED") return { ok: true, message: "A sync is already running." } as ActionResult;
    return { ok: true, message: `Checked ${summary.discovered} message(s): ${summary.ingested} new, ${summary.processed} processed.` } as ActionResult;
  }) as Promise<ActionResult>;
}

function draftFrom(form: FormData): ReviewDraft {
  const draft: ReviewDraft = {};
  for (const key of EXTRACTION_FIELDS) {
    const value = form.get(`field_${key}`);
    if (typeof value === "string") draft[key] = value;
  }
  return draft;
}

const lines = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.split("\n").map((l) => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean) : [];

export async function saveIntakeDraftAction(id: string, form: FormData): Promise<ActionResult> {
  return authorized(async (actor) => {
    const result = await saveReviewDraft(id, draftFrom(form), actor, getIntakeRuntime().review);
    revalidatePath(`/app/recruiting/job-intake/${id}`);
    return result.ok ? { ok: true, message: "Draft fields saved." } : result;
  }) as Promise<ActionResult>;
}

export async function approveIntakeAction(id: string, form: FormData): Promise<ActionResult> {
  return authorized(async (actor) => {
    const runtime = getIntakeRuntime();
    await saveReviewDraft(id, draftFrom(form), actor, runtime.review);
    const ref = await runtime.referenceData();
    const departmentId = String(form.get("departmentId") ?? "");
    const locationId = String(form.get("locationId") ?? "");
    const result = await approveAsDraft(
      id,
      {
        title: form.get("field_title"),
        departmentId,
        departmentName: ref.departments.find((d) => d.id === departmentId)?.name ?? "",
        positionId: String(form.get("positionId") ?? ""),
        locationId,
        locationName: ref.locations.find((l) => l.id === locationId)?.name ?? "",
        employmentType: form.get("employmentType"),
        workplaceType: form.get("workplaceType"),
        careerArea: form.get("careerArea"),
        description: form.get("field_description"),
        responsibilities: lines(form.get("field_responsibilities")),
        qualifications: lines(form.get("field_requiredSkills")).concat(lines(form.get("qualifications"))),
        preferredQualifications: lines(form.get("field_preferredSkills")),
        acknowledgeDuplicates: form.get("acknowledgeDuplicates") === "on",
      },
      actor,
      runtime.review,
    );
    revalidatePath("/app/recruiting/job-intake");
    revalidatePath(`/app/recruiting/job-intake/${id}`);
    return result.ok
      ? { ok: true, message: "Draft requisition created. It is not published.", requisitionId: result.intake.linkedRequisitionId ?? undefined }
      : result;
  }) as Promise<ActionResult>;
}

export async function linkIntakeAction(id: string, form: FormData): Promise<ActionResult> {
  return authorized(async (actor) => {
    const result = await linkToRequisition(id, String(form.get("requisitionId") ?? ""), actor, getIntakeRuntime().review);
    revalidatePath(`/app/recruiting/job-intake/${id}`);
    return result.ok ? { ok: true, message: "Linked. The requisition itself was not changed.", requisitionId: result.intake.linkedRequisitionId ?? undefined } : result;
  }) as Promise<ActionResult>;
}

export async function dismissIntakeAction(id: string, kind: "IGNORED" | "NOT_A_JOB", form: FormData): Promise<ActionResult> {
  return authorized(async (actor) => {
    const note = form.get("note");
    const result = await dismiss(id, kind, typeof note === "string" && note.trim() ? note : null, actor, getIntakeRuntime().review);
    revalidatePath("/app/recruiting/job-intake");
    revalidatePath(`/app/recruiting/job-intake/${id}`);
    return result.ok ? { ok: true, message: kind === "IGNORED" ? "Ignored." : "Marked as not a job." } : result;
  }) as Promise<ActionResult>;
}
