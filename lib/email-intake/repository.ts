/**
 * Persistence boundary for email intake. Implementations: Supabase
 * (lib/email-intake/supabase-repository.ts) and in-memory (mock mode + tests).
 * There is intentionally no method that creates a requisition or job — drafts
 * are created only by recruiter review actions through the recruiting domain.
 */

import type {
  DuplicateSignal,
  IntakeAttachment,
  IntakeEvent,
  IntakeMessage,
  IntakeSource,
  IntakeStatus,
  JobExtraction,
  ReviewDraft,
} from "@/lib/email-intake/types";

export type NewIntakeMessage = Pick<
  IntakeMessage,
  | "sourceId"
  | "provider"
  | "providerAccountId"
  | "providerFolderId"
  | "providerMessageId"
  | "providerThreadId"
  | "fromAddress"
  | "fromName"
  | "toAddresses"
  | "ccAddresses"
  | "subject"
  | "receivedAt"
  | "hasAttachments"
>;

export type ProcessingResult = {
  normalizedText: string;
  attachments: IntakeAttachment[];
  classification: IntakeMessage["classification"];
  classificationConfidence: number;
  classificationSource: NonNullable<IntakeMessage["classificationSource"]>;
  classificationReasons: string[];
  extraction: JobExtraction | null;
  extractionModel: string | null;
  duplicateSignals: DuplicateSignal[];
  processingStatus: Extract<IntakeStatus, "REVIEW_REQUIRED" | "IGNORED">;
};

export type ReviewPatch = Partial<
  Pick<
    IntakeMessage,
    | "processingStatus"
    | "classification"
    | "classificationSource"
    | "reviewDraft"
    | "linkedRequisitionId"
    | "linkedJobId"
    | "reviewedByProfileId"
    | "reviewedAt"
    | "reviewNote"
  >
>;

export type IntakeRepository = {
  ensureSource(input: Omit<IntakeSource, "syncCursorReceivedAt" | "lastSyncStartedAt" | "lastSyncCompletedAt" | "lastSyncStatus" | "lastError" | "consecutiveFailures">): Promise<IntakeSource>;
  /** Single-flight sync: false when another worker holds an unexpired lock. */
  acquireSyncLock(sourceId: string, owner: string, until: Date, now: Date): Promise<boolean>;
  finishSync(
    sourceId: string,
    owner: string,
    result: { status: "OK" | "PARTIAL" | "FAILED"; cursor: string | null; error: string | null },
    now: Date,
  ): Promise<void>;
  /** Idempotent on (provider, account, provider message id). */
  insertMessageIfNew(message: NewIntakeMessage, now: Date): Promise<{ inserted: boolean; id: string }>;
  /** Claims RECEIVED / due FAILED messages (stale claims older than 10 minutes are reclaimable). */
  claimForProcessing(limit: number, owner: string, now: Date, maxAttempts: number): Promise<IntakeMessage[]>;
  saveProcessingResult(id: string, owner: string, result: ProcessingResult, now: Date): Promise<void>;
  recordProcessingFailure(id: string, owner: string, error: string, nextAttemptAt: Date | null, now: Date): Promise<void>;
  listThread(provider: string, accountId: string, threadId: string): Promise<IntakeMessage[]>;
  listForDuplicateCheck(since: Date): Promise<IntakeMessage[]>;
  get(id: string): Promise<IntakeMessage | null>;
  list(statuses: IntakeStatus[], limit: number): Promise<IntakeMessage[]>;
  countByStatus(): Promise<Partial<Record<IntakeStatus, number>>>;
  /** Applies a review change only while the message is in one of `fromStatuses`. */
  updateReview(id: string, fromStatuses: IntakeStatus[], patch: ReviewPatch, now: Date): Promise<IntakeMessage | null>;
  saveReviewDraft(id: string, draft: ReviewDraft, now: Date): Promise<void>;
  addEvent(event: Omit<IntakeEvent, "id" | "createdAt">, now: Date): Promise<void>;
  listEvents(intakeMessageId: string): Promise<IntakeEvent[]>;
  getSource(sourceId: string): Promise<IntakeSource | null>;
};

const CLAIM_STALE_MS = 10 * 60 * 1000;

export function createMemoryIntakeRepository(): IntakeRepository & { messages: Map<string, IntakeMessage>; events: IntakeEvent[] } {
  const sources = new Map<string, IntakeSource & { lockOwner: string | null; lockUntil: number }>();
  const messages = new Map<string, IntakeMessage>();
  const claims = new Map<string, { owner: string; at: number }>();
  const events: IntakeEvent[] = [];
  let seq = 0;

  const byProviderKey = (m: Pick<IntakeMessage, "provider" | "providerAccountId" | "providerMessageId">) =>
    `${m.provider}|${m.providerAccountId}|${m.providerMessageId}`;

  return {
    messages,
    events,

    async ensureSource(input) {
      const existing = sources.get(input.id);
      if (existing) return existing;
      const created = {
        ...input,
        syncCursorReceivedAt: null,
        lastSyncStartedAt: null,
        lastSyncCompletedAt: null,
        lastSyncStatus: null,
        lastError: null,
        consecutiveFailures: 0,
        lockOwner: null,
        lockUntil: 0,
      };
      sources.set(input.id, created);
      return created;
    },

    async acquireSyncLock(sourceId, owner, until, now) {
      const source = sources.get(sourceId);
      if (!source) return false;
      if (source.lockOwner && source.lockUntil > now.getTime()) return false;
      source.lockOwner = owner;
      source.lockUntil = until.getTime();
      source.lastSyncStartedAt = now.toISOString();
      return true;
    },

    async finishSync(sourceId, owner, result, now) {
      const source = sources.get(sourceId);
      if (!source || source.lockOwner !== owner) return;
      source.lockOwner = null;
      source.lockUntil = 0;
      source.lastSyncStatus = result.status;
      source.lastError = result.error;
      if (result.cursor) source.syncCursorReceivedAt = result.cursor;
      if (result.status === "FAILED") source.consecutiveFailures += 1;
      else {
        source.consecutiveFailures = 0;
        source.lastSyncCompletedAt = now.toISOString();
      }
    },

    async insertMessageIfNew(message, now) {
      const key = byProviderKey(message);
      for (const existing of messages.values()) {
        if (byProviderKey(existing) === key) return { inserted: false, id: existing.id };
      }
      const id = `intake-${++seq}`;
      const at = now.toISOString();
      messages.set(id, {
        ...message,
        id,
        normalizedText: null,
        attachments: [],
        classification: null,
        classificationConfidence: null,
        classificationSource: null,
        classificationReasons: [],
        extraction: null,
        extractionModel: null,
        extractedAt: null,
        duplicateSignals: [],
        reviewDraft: null,
        processingStatus: "RECEIVED",
        attemptCount: 0,
        nextAttemptAt: null,
        lastError: null,
        linkedRequisitionId: null,
        linkedJobId: null,
        reviewedByProfileId: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: at,
        updatedAt: at,
      });
      return { inserted: true, id };
    },

    async claimForProcessing(limit, owner, now, maxAttempts) {
      const t = now.getTime();
      const due = [...messages.values()]
        .filter((m) => {
          const claim = claims.get(m.id);
          if (claim && t - claim.at < CLAIM_STALE_MS) return false;
          if (m.processingStatus === "RECEIVED") return true;
          if (m.processingStatus === "PROCESSING") return Boolean(claim);
          return (
            m.processingStatus === "FAILED" &&
            m.attemptCount < maxAttempts &&
            (!m.nextAttemptAt || Date.parse(m.nextAttemptAt) <= t)
          );
        })
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
        .slice(0, limit);
      for (const m of due) {
        claims.set(m.id, { owner, at: t });
        m.processingStatus = "PROCESSING";
        m.attemptCount += 1;
        m.updatedAt = now.toISOString();
      }
      return due.map((m) => ({ ...m }));
    },

    async saveProcessingResult(id, owner, result, now) {
      const m = messages.get(id);
      if (!m || claims.get(id)?.owner !== owner) return;
      Object.assign(m, {
        ...result,
        extractedAt: result.extraction ? now.toISOString() : null,
        lastError: null,
        nextAttemptAt: null,
        updatedAt: now.toISOString(),
      });
      claims.delete(id);
    },

    async recordProcessingFailure(id, owner, error, nextAttemptAt, now) {
      const m = messages.get(id);
      if (!m || claims.get(id)?.owner !== owner) return;
      m.processingStatus = "FAILED";
      m.lastError = error;
      m.nextAttemptAt = nextAttemptAt?.toISOString() ?? null;
      m.updatedAt = now.toISOString();
      claims.delete(id);
    },

    async listThread(provider, accountId, threadId) {
      return [...messages.values()].filter(
        (m) => m.provider === provider && m.providerAccountId === accountId && m.providerThreadId === threadId,
      );
    },

    async listForDuplicateCheck(since) {
      return [...messages.values()].filter((m) => Date.parse(m.receivedAt) >= since.getTime());
    },

    async get(id) {
      const m = messages.get(id);
      return m ? { ...m } : null;
    },

    async list(statuses, limit) {
      return [...messages.values()]
        .filter((m) => statuses.includes(m.processingStatus))
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
        .slice(0, limit)
        .map((m) => ({ ...m }));
    },

    async countByStatus() {
      const counts: Partial<Record<IntakeStatus, number>> = {};
      for (const m of messages.values()) counts[m.processingStatus] = (counts[m.processingStatus] ?? 0) + 1;
      return counts;
    },

    async updateReview(id, fromStatuses, patch, now) {
      const m = messages.get(id);
      if (!m || !fromStatuses.includes(m.processingStatus)) return null;
      Object.assign(m, patch, { updatedAt: now.toISOString() });
      return { ...m };
    },

    async saveReviewDraft(id, draft, now) {
      const m = messages.get(id);
      if (!m) return;
      m.reviewDraft = draft;
      m.updatedAt = now.toISOString();
    },

    async addEvent(event, now) {
      events.push({ ...event, id: `evt-${events.length + 1}`, createdAt: now.toISOString() });
    },

    async listEvents(intakeMessageId) {
      return events.filter((e) => e.intakeMessageId === intakeMessageId).reverse();
    },

    async getSource(sourceId) {
      return sources.get(sourceId) ?? null;
    },
  };
}
