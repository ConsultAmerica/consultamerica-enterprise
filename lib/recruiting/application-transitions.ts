/**
 * Central application status transitions.
 * UI must not mutate applications.status directly — call this (or
 * recruitingRepository.updateApplicationStage, which delegates here).
 */

import { getSupabaseServiceClient, isSupabaseConfigured } from "@/app/lib/supabase/server";
import { assertApplicationTransition } from "@/lib/recruiting/status-machine";
import type { ApplicationStatus } from "@/types/recruiting";

export type TransitionApplicationStatusInput = {
  applicationId: string;
  toStatus: ApplicationStatus;
  actorUserId?: string;
  reason?: string;
  notes?: string;
  /** Skip machine check only for hire RPC idempotent re-entry. */
  allowIdempotentSameStatus?: boolean;
};

export type TransitionApplicationStatusResult = {
  fromStatus: ApplicationStatus;
  toStatus: ApplicationStatus;
  historyId: string;
};

function historyNote(reason?: string, notes?: string): string | undefined {
  const parts = [reason, notes].filter(Boolean);
  return parts.length ? parts.join(" — ") : undefined;
}

/**
 * Validates transition, updates applications.status, appends
 * application_status_history + recruiting_activities.
 */
export async function transitionApplicationStatus(
  input: TransitionApplicationStatusInput,
): Promise<TransitionApplicationStatusResult> {
  if (!isSupabaseConfigured()) {
    // Memory path handled by repository.updateApplicationStage
    throw new Error("transitionApplicationStatus requires Supabase");
  }

  const client = getSupabaseServiceClient();
  if (!client) throw new Error("Supabase is not configured");

  const { data: applicationRow, error: loadError } = await client
    .from("applications")
    .select("id, candidate_id, requisition_id, status")
    .eq("id", input.applicationId)
    .maybeSingle();

  if (loadError || !applicationRow) {
    throw new Error("Application not found");
  }

  const fromStatus = applicationRow.status as ApplicationStatus;
  const toStatus = input.toStatus;

  if (fromStatus === toStatus) {
    if (input.allowIdempotentSameStatus) {
      return {
        fromStatus,
        toStatus,
        historyId: `hist-idempotent-${applicationRow.id}-${toStatus}`,
      };
    }
    throw new Error(`Application is already ${toStatus}`);
  }

  assertApplicationTransition(fromStatus, toStatus);

  const note = historyNote(input.reason, input.notes);
  const { data, error } = await client.rpc("application_status_transition", {
    p_application_id: input.applicationId,
    p_to_status: toStatus,
    p_actor_user_id: input.actorUserId ?? null,
    p_note: note ?? null,
    p_privileged: false,
  });

  if (error) throw new Error(error.message);

  const result = data as {
    fromStatus: ApplicationStatus;
    toStatus: ApplicationStatus;
    historyId: string;
  };

  return {
    fromStatus: result.fromStatus ?? fromStatus,
    toStatus: result.toStatus ?? toStatus,
    historyId: result.historyId,
  };
}

/** Initial SUBMITTED/APPLIED history row when an application is created. */
export async function recordApplicationSubmittedHistory(input: {
  applicationId: string;
  candidateId: string;
  requisitionId: string;
  actorUserId?: string;
}): Promise<void> {
  const client = getSupabaseServiceClient();
  if (!client) return;

  const now = new Date().toISOString();
  await client.from("application_status_history").insert({
    id: `hist-${crypto.randomUUID()}`,
    application_id: input.applicationId,
    from_status: null,
    to_status: "APPLIED",
    changed_by_user_id: input.actorUserId ?? null,
    note: "Application submitted",
    created_at: now,
  });
}
