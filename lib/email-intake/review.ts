/**
 * Recruiter review actions for intake items (pure orchestration over ports).
 *
 * - "Approve as draft" creates a DRAFT requisition through the recruiting
 *   domain with publishNow hard-coded to false. Publishing stays a separate,
 *   explicit recruiter action in the requisition workflow.
 * - "Link to requisition" records the association only; it never rewrites
 *   an approved requisition's fields.
 * Every action is audited (email_intake_events, and recruiting_activities
 * for requisition-level events).
 */

import { z } from "zod";

import type { IntakeRepository } from "@/lib/email-intake/repository";
import { EXTRACTION_FIELDS, type IntakeMessage, type IntakeStatus, type ReviewDraft } from "@/lib/email-intake/types";
import type { CreateJobRequisitionInput } from "@/lib/recruiting/repository";

export type ReviewActor = { profileId: string | null; displayName: string };

export type ReviewDeps = {
  repo: IntakeRepository;
  createDraftRequisition(input: CreateJobRequisitionInput): Promise<{ requisitionId: string }>;
  requisitionExists(requisitionId: string): Promise<boolean>;
  recordRequisitionActivity(input: { requisitionId: string; activityType: string; summary: string; actorProfileId: string | null }): Promise<void>;
  now?: () => Date;
};

export type ReviewResult = { ok: true; intake: IntakeMessage } | { ok: false; error: string };

const REVIEWABLE: IntakeStatus[] = ["REVIEW_REQUIRED", "FAILED", "IGNORED", "NOT_A_JOB"];

export const approveDraftSchema = z.object({
  title: z.string().trim().min(2).max(160),
  departmentId: z.string().min(1),
  departmentName: z.string().min(1),
  positionId: z.string().min(1),
  locationId: z.string().min(1),
  locationName: z.string().min(1),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY"]),
  workplaceType: z.enum(["REMOTE", "HYBRID", "ONSITE"]),
  careerArea: z.enum(["experienced-professionals", "technology-oracle", "ai-data", "consulting", "early-careers"]),
  description: z.string().trim().min(10).max(8000),
  responsibilities: z.array(z.string().trim().min(1).max(500)).max(30),
  qualifications: z.array(z.string().trim().min(1).max(500)).max(30),
  preferredQualifications: z.array(z.string().trim().min(1).max(500)).max(30),
  acknowledgeDuplicates: z.boolean(),
});
export type ApproveDraftInput = z.infer<typeof approveDraftSchema>;

const event = (deps: ReviewDeps, intake: IntakeMessage, actor: ReviewActor, eventType: Parameters<IntakeRepository["addEvent"]>[0]["eventType"], detail: Record<string, unknown>, requisitionId: string | null = null) =>
  deps.repo.addEvent(
    { intakeMessageId: intake.id, sourceId: intake.sourceId, eventType, actorType: "RECRUITER", actorProfileId: actor.profileId, requisitionId, detail },
    (deps.now ?? (() => new Date()))(),
  );

export async function saveReviewDraft(id: string, draft: ReviewDraft, actor: ReviewActor, deps: ReviewDeps): Promise<ReviewResult> {
  const intake = await deps.repo.get(id);
  if (!intake) return { ok: false, error: "Intake item not found." };
  const clean: ReviewDraft = {};
  for (const key of EXTRACTION_FIELDS) {
    const value = draft[key];
    if (typeof value === "string" && value.trim()) clean[key] = value.trim().slice(0, key === "description" ? 8000 : 1000);
  }
  await deps.repo.saveReviewDraft(id, clean, (deps.now ?? (() => new Date()))());
  const changed = EXTRACTION_FIELDS.filter((k) => (intake.reviewDraft?.[k] ?? "") !== (clean[k] ?? ""));
  if (changed.length) await event(deps, intake, actor, "FIELDS_EDITED", { fields: changed });
  return { ok: true, intake: { ...intake, reviewDraft: clean } };
}

export async function approveAsDraft(id: string, rawInput: unknown, actor: ReviewActor, deps: ReviewDeps): Promise<ReviewResult> {
  const parsed = approveDraftSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: "Complete the required fields: title, department, position, location, type, arrangement, career area and description." };
  const input = parsed.data;
  const now = deps.now ?? (() => new Date());

  const intake = await deps.repo.get(id);
  if (!intake) return { ok: false, error: "Intake item not found." };
  if (intake.linkedRequisitionId) return { ok: false, error: "This email is already linked to a requisition." };
  if (intake.duplicateSignals.length && !input.acknowledgeDuplicates) {
    return { ok: false, error: "Review the possible duplicates and confirm this is a separate requirement before creating a draft." };
  }

  // Claim the item first so two recruiters cannot create two drafts.
  const claimed = await deps.repo.updateReview(id, REVIEWABLE, { processingStatus: "DRAFTED", reviewedByProfileId: actor.profileId, reviewedAt: now().toISOString() }, now());
  if (!claimed) return { ok: false, error: "This item was already handled. Refresh to see its current status." };

  let requisitionId: string;
  try {
    ({ requisitionId } = await deps.createDraftRequisition({
      title: input.title,
      departmentId: input.departmentId,
      departmentName: input.departmentName,
      positionId: input.positionId,
      locationId: input.locationId,
      locationName: input.locationName,
      employmentType: input.employmentType,
      workplaceType: input.workplaceType,
      careerArea: input.careerArea,
      openings: 1,
      description: input.description,
      responsibilities: input.responsibilities,
      qualifications: input.qualifications,
      preferredQualifications: input.preferredQualifications,
      publishNow: false, // email-derived requirements are never published automatically
    }));
  } catch {
    await deps.repo.updateReview(id, ["DRAFTED"], { processingStatus: intake.processingStatus, reviewedByProfileId: null, reviewedAt: null }, now());
    return { ok: false, error: "The draft requisition could not be created. Nothing was saved; please try again." };
  }

  const updated = await deps.repo.updateReview(id, ["DRAFTED"], { linkedRequisitionId: requisitionId }, now());
  await event(deps, intake, actor, "DRAFT_CREATED", { duplicatesAcknowledged: intake.duplicateSignals.length > 0 }, requisitionId);
  await deps.recordRequisitionActivity({
    requisitionId,
    activityType: "REQUISITION_DRAFTED_FROM_EMAIL",
    summary: `Draft created from intake email "${(intake.subject ?? "").slice(0, 120)}" by ${actor.displayName}`,
    actorProfileId: actor.profileId,
  });
  return { ok: true, intake: updated ?? { ...claimed, linkedRequisitionId: requisitionId } };
}

export async function linkToRequisition(id: string, requisitionId: string, actor: ReviewActor, deps: ReviewDeps): Promise<ReviewResult> {
  const now = deps.now ?? (() => new Date());
  const intake = await deps.repo.get(id);
  if (!intake) return { ok: false, error: "Intake item not found." };
  if (!(await deps.requisitionExists(requisitionId))) return { ok: false, error: "Requisition not found." };
  const updated = await deps.repo.updateReview(
    id,
    REVIEWABLE,
    { processingStatus: "LINKED", linkedRequisitionId: requisitionId, reviewedByProfileId: actor.profileId, reviewedAt: now().toISOString() },
    now(),
  );
  if (!updated) return { ok: false, error: "This item was already handled. Refresh to see its current status." };
  await event(deps, intake, actor, "LINKED_TO_REQUISITION", {}, requisitionId);
  await deps.recordRequisitionActivity({
    requisitionId,
    activityType: "INTAKE_EMAIL_LINKED",
    summary: `Intake email "${(intake.subject ?? "").slice(0, 120)}" linked for review (requisition not modified)`,
    actorProfileId: actor.profileId,
  });
  return { ok: true, intake: updated };
}

export async function dismiss(
  id: string,
  kind: "IGNORED" | "NOT_A_JOB",
  note: string | null,
  actor: ReviewActor,
  deps: ReviewDeps,
): Promise<ReviewResult> {
  const now = deps.now ?? (() => new Date());
  const intake = await deps.repo.get(id);
  if (!intake) return { ok: false, error: "Intake item not found." };
  const updated = await deps.repo.updateReview(
    id,
    ["REVIEW_REQUIRED", "FAILED", kind === "IGNORED" ? "NOT_A_JOB" : "IGNORED"],
    {
      processingStatus: kind,
      ...(kind === "NOT_A_JOB" ? { classification: "NON_RECRUITING" as const, classificationSource: "RECRUITER" as const } : {}),
      reviewedByProfileId: actor.profileId,
      reviewedAt: now().toISOString(),
      reviewNote: note?.slice(0, 500) ?? null,
    },
    now(),
  );
  if (!updated) return { ok: false, error: "This item was already handled. Refresh to see its current status." };
  await event(deps, intake, actor, kind === "IGNORED" ? "IGNORED" : "MARKED_NOT_A_JOB", { note: note ? "provided" : null });
  return { ok: true, intake: updated };
}
