import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { IntakeRepository, NewIntakeMessage } from "@/lib/email-intake/repository";
import type { IntakeEvent, IntakeMessage, IntakeSource, IntakeStatus } from "@/lib/email-intake/types";

/**
 * Supabase implementation (tables from db/schema/045). Claims and sync locks
 * use conditional UPDATEs so only one worker wins — the same claim pattern as
 * functional-source clientflow_claim_email_message.
 */

const CLAIM_STALE_MS = 10 * 60 * 1000;
type Row = Record<string, unknown>;

function check(error: { code?: string; message: string } | null, what: string) {
  if (error) throw new Error(`${what} (${error.code ?? "no-code"}): ${error.message}`);
}

function toMessage(r: Row): IntakeMessage {
  return {
    id: r.id as string,
    sourceId: r.source_id as string,
    provider: r.provider as IntakeMessage["provider"],
    providerAccountId: r.provider_account_id as string,
    providerFolderId: r.provider_folder_id as string,
    providerMessageId: r.provider_message_id as string,
    providerThreadId: (r.provider_thread_id as string) ?? null,
    fromAddress: (r.from_address as string) ?? null,
    fromName: (r.from_name as string) ?? null,
    toAddresses: (r.to_addresses as string[]) ?? [],
    ccAddresses: (r.cc_addresses as string[]) ?? [],
    subject: (r.subject as string) ?? null,
    receivedAt: r.received_at as string,
    normalizedText: (r.normalized_text as string) ?? null,
    attachments: (r.attachments as IntakeMessage["attachments"]) ?? [],
    hasAttachments: Boolean(r.has_attachments),
    classification: (r.classification as IntakeMessage["classification"]) ?? null,
    classificationConfidence: r.classification_confidence === null ? null : Number(r.classification_confidence),
    classificationSource: (r.classification_source as IntakeMessage["classificationSource"]) ?? null,
    classificationReasons: (r.classification_reasons as string[]) ?? [],
    extraction: (r.extraction as IntakeMessage["extraction"]) ?? null,
    extractionModel: (r.extraction_model as string) ?? null,
    extractedAt: (r.extracted_at as string) ?? null,
    duplicateSignals: (r.duplicate_signals as IntakeMessage["duplicateSignals"]) ?? [],
    reviewDraft: (r.review_draft as IntakeMessage["reviewDraft"]) ?? null,
    processingStatus: r.processing_status as IntakeStatus,
    attemptCount: Number(r.attempt_count ?? 0),
    nextAttemptAt: (r.next_attempt_at as string) ?? null,
    lastError: (r.last_error as string) ?? null,
    linkedRequisitionId: (r.linked_requisition_id as string) ?? null,
    linkedJobId: (r.linked_job_id as string) ?? null,
    reviewedByProfileId: (r.reviewed_by_profile_id as string) ?? null,
    reviewedAt: (r.reviewed_at as string) ?? null,
    reviewNote: (r.review_note as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toSource(r: Row): IntakeSource {
  return {
    id: r.id as string,
    provider: r.provider as IntakeSource["provider"],
    providerAccountId: r.provider_account_id as string,
    providerFolderId: r.provider_folder_id as string,
    mailboxAddress: (r.mailbox_address as string) ?? null,
    folderName: (r.folder_name as string) ?? null,
    initialSyncAfter: r.initial_sync_after as string,
    syncCursorReceivedAt: (r.sync_cursor_received_at as string) ?? null,
    lastSyncStartedAt: (r.last_sync_started_at as string) ?? null,
    lastSyncCompletedAt: (r.last_sync_completed_at as string) ?? null,
    lastSyncStatus: (r.last_sync_status as IntakeSource["lastSyncStatus"]) ?? null,
    lastError: (r.last_error as string) ?? null,
    consecutiveFailures: Number(r.consecutive_failures ?? 0),
  };
}

const PATCH_COLUMNS: Record<string, string> = {
  processingStatus: "processing_status",
  classification: "classification",
  classificationSource: "classification_source",
  reviewDraft: "review_draft",
  linkedRequisitionId: "linked_requisition_id",
  linkedJobId: "linked_job_id",
  reviewedByProfileId: "reviewed_by_profile_id",
  reviewedAt: "reviewed_at",
  reviewNote: "review_note",
};

export function createSupabaseIntakeRepository(client: SupabaseClient): IntakeRepository {
  const messages = () => client.from("email_intake_messages");

  return {
    async ensureSource(input) {
      const { error } = await client.from("email_intake_sources").upsert(
        {
          id: input.id,
          provider: input.provider,
          provider_account_id: input.providerAccountId,
          provider_folder_id: input.providerFolderId,
          mailbox_address: input.mailboxAddress,
          folder_name: input.folderName,
          initial_sync_after: input.initialSyncAfter,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      check(error, "intake source upsert failed");
      const { data, error: readError } = await client.from("email_intake_sources").select("*").eq("id", input.id).single();
      check(readError, "intake source read failed");
      return toSource(data as Row);
    },

    async acquireSyncLock(sourceId, owner, until, now) {
      const { data, error } = await client
        .from("email_intake_sources")
        .update({ sync_lock_owner: owner, sync_lock_until: until.toISOString(), last_sync_started_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", sourceId)
        .or(`sync_lock_until.is.null,sync_lock_until.lt.${now.toISOString()}`)
        .select("id");
      check(error, "sync lock failed");
      return (data ?? []).length === 1;
    },

    async finishSync(sourceId, owner, result, now) {
      const { data: current, error: readError } = await client.from("email_intake_sources").select("consecutive_failures").eq("id", sourceId).single();
      check(readError, "intake source read failed");
      const failures = Number((current as Row).consecutive_failures ?? 0);
      const { error } = await client
        .from("email_intake_sources")
        .update({
          sync_lock_owner: null,
          sync_lock_until: null,
          last_sync_status: result.status,
          last_error: result.error,
          ...(result.cursor ? { sync_cursor_received_at: result.cursor } : {}),
          ...(result.status === "FAILED"
            ? { consecutive_failures: failures + 1 }
            : { consecutive_failures: 0, last_sync_completed_at: now.toISOString() }),
          updated_at: now.toISOString(),
        })
        .eq("id", sourceId)
        .eq("sync_lock_owner", owner);
      check(error, "sync finish failed");
    },

    async insertMessageIfNew(m: NewIntakeMessage, now) {
      const id = `intake-${crypto.randomUUID()}`;
      const { data, error } = await messages()
        .upsert(
          {
            id,
            source_id: m.sourceId,
            provider: m.provider,
            provider_account_id: m.providerAccountId,
            provider_folder_id: m.providerFolderId,
            provider_message_id: m.providerMessageId,
            provider_thread_id: m.providerThreadId,
            from_address: m.fromAddress,
            from_name: m.fromName,
            to_addresses: m.toAddresses,
            cc_addresses: m.ccAddresses,
            subject: m.subject,
            received_at: m.receivedAt,
            has_attachments: m.hasAttachments,
            processing_status: "RECEIVED",
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          },
          { onConflict: "provider,provider_account_id,provider_message_id", ignoreDuplicates: true },
        )
        .select("id");
      check(error, "intake insert failed");
      if (data && data.length) return { inserted: true, id: data[0].id as string };
      const { data: existing, error: readError } = await messages()
        .select("id")
        .eq("provider", m.provider)
        .eq("provider_account_id", m.providerAccountId)
        .eq("provider_message_id", m.providerMessageId)
        .single();
      check(readError, "intake lookup failed");
      return { inserted: false, id: (existing as Row).id as string };
    },

    async claimForProcessing(limit, owner, now, maxAttempts) {
      const iso = now.toISOString();
      const stale = new Date(now.getTime() - CLAIM_STALE_MS).toISOString();
      const { data: candidates, error } = await messages()
        .select("*")
        .or(
          `processing_status.eq.RECEIVED,and(processing_status.eq.FAILED,attempt_count.lt.${maxAttempts},or(next_attempt_at.is.null,next_attempt_at.lte.${iso})),and(processing_status.eq.PROCESSING,claimed_at.lt.${stale})`,
        )
        .order("received_at", { ascending: true })
        .limit(limit);
      check(error, "intake claim query failed");
      const claimed: IntakeMessage[] = [];
      for (const row of (candidates ?? []) as Row[]) {
        const { data: won, error: claimError } = await messages()
          .update({ processing_status: "PROCESSING", claimed_at: iso, claimed_by: owner, attempt_count: Number(row.attempt_count ?? 0) + 1, updated_at: iso })
          .eq("id", row.id as string)
          .eq("updated_at", row.updated_at as string) // optimistic: nobody touched it since we read it
          .select("*");
        check(claimError, "intake claim failed");
        if (won && won.length) claimed.push(toMessage(won[0] as Row));
      }
      return claimed;
    },

    async saveProcessingResult(id, owner, result, now) {
      const { error } = await messages()
        .update({
          normalized_text: result.normalizedText,
          attachments: result.attachments,
          classification: result.classification,
          classification_confidence: result.classificationConfidence,
          classification_source: result.classificationSource,
          classification_reasons: result.classificationReasons,
          extraction: result.extraction,
          extraction_model: result.extractionModel,
          extracted_at: result.extraction ? now.toISOString() : null,
          duplicate_signals: result.duplicateSignals,
          processing_status: result.processingStatus,
          last_error: null,
          next_attempt_at: null,
          claimed_at: null,
          claimed_by: null,
          updated_at: now.toISOString(),
        })
        .eq("id", id)
        .eq("claimed_by", owner);
      check(error, "intake save failed");
    },

    async recordProcessingFailure(id, owner, errorText, nextAttemptAt, now) {
      const { error } = await messages()
        .update({
          processing_status: "FAILED",
          last_error: errorText.slice(0, 500),
          next_attempt_at: nextAttemptAt?.toISOString() ?? null,
          claimed_at: null,
          claimed_by: null,
          updated_at: now.toISOString(),
        })
        .eq("id", id)
        .eq("claimed_by", owner);
      check(error, "intake failure record failed");
    },

    async listThread(provider, accountId, threadId) {
      const { data, error } = await messages().select("*").eq("provider", provider).eq("provider_account_id", accountId).eq("provider_thread_id", threadId);
      check(error, "thread lookup failed");
      return (data ?? []).map((r) => toMessage(r as Row));
    },

    async listForDuplicateCheck(since) {
      const { data, error } = await messages()
        .select("*")
        .gte("received_at", since.toISOString())
        .in("classification", ["JOB_REQUIREMENT", "JOB_UPDATE"])
        .limit(500);
      check(error, "duplicate lookup failed");
      return (data ?? []).map((r) => toMessage(r as Row));
    },

    async get(id) {
      const { data, error } = await messages().select("*").eq("id", id).maybeSingle();
      check(error, "intake read failed");
      return data ? toMessage(data as Row) : null;
    },

    async list(statuses, limit) {
      const { data, error } = await messages().select("*").in("processing_status", statuses).order("received_at", { ascending: false }).limit(limit);
      check(error, "intake list failed");
      return (data ?? []).map((r) => toMessage(r as Row));
    },

    async countByStatus() {
      const counts: Partial<Record<IntakeStatus, number>> = {};
      const { data, error } = await messages().select("processing_status").limit(5000);
      check(error, "intake count failed");
      for (const r of data ?? []) {
        const s = (r as Row).processing_status as IntakeStatus;
        counts[s] = (counts[s] ?? 0) + 1;
      }
      return counts;
    },

    async updateReview(id, fromStatuses, patch, now) {
      const update: Row = { updated_at: now.toISOString() };
      for (const [key, value] of Object.entries(patch)) {
        const column = PATCH_COLUMNS[key];
        if (column) update[column] = value;
      }
      const { data, error } = await messages().update(update).eq("id", id).in("processing_status", fromStatuses).select("*");
      check(error, "intake review update failed");
      return data && data.length ? toMessage(data[0] as Row) : null;
    },

    async saveReviewDraft(id, draft, now) {
      const { error } = await messages().update({ review_draft: draft, updated_at: now.toISOString() }).eq("id", id);
      check(error, "intake draft save failed");
    },

    async addEvent(e, now) {
      const { error } = await client.from("email_intake_events").insert({
        id: `iev-${crypto.randomUUID()}`,
        intake_message_id: e.intakeMessageId,
        source_id: e.sourceId,
        event_type: e.eventType,
        actor_type: e.actorType,
        actor_profile_id: e.actorProfileId,
        requisition_id: e.requisitionId,
        detail: e.detail,
        created_at: now.toISOString(),
      });
      check(error, "intake event insert failed");
    },

    async listEvents(intakeMessageId) {
      const { data, error } = await client
        .from("email_intake_events")
        .select("*")
        .eq("intake_message_id", intakeMessageId)
        .order("created_at", { ascending: false })
        .limit(100);
      check(error, "intake events read failed");
      return (data ?? []).map(
        (r): IntakeEvent => ({
          id: r.id as string,
          intakeMessageId: r.intake_message_id as string,
          sourceId: (r.source_id as string) ?? null,
          eventType: r.event_type as IntakeEvent["eventType"],
          actorType: r.actor_type as IntakeEvent["actorType"],
          actorProfileId: (r.actor_profile_id as string) ?? null,
          requisitionId: (r.requisition_id as string) ?? null,
          detail: (r.detail as Record<string, unknown>) ?? {},
          createdAt: r.created_at as string,
        }),
      );
    },

    async getSource(sourceId) {
      const { data, error } = await client.from("email_intake_sources").select("*").eq("id", sourceId).maybeSingle();
      check(error, "intake source read failed");
      return data ? toSource(data as Row) : null;
    },
  };
}
