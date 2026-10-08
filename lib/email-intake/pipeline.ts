/**
 * Email intake sync + processing (pure orchestration over ports).
 *
 *   list folder (newest first, back to cursor − overlap, never before
 *   initialSyncAfter) → allowlist → idempotent insert → claim → read body +
 *   safe attachments → classify (rules, then AI if ambiguous) → AI extraction
 *   validated against the email text → duplicate signals → REVIEW_REQUIRED.
 *
 * The pipeline never creates requisitions or jobs and never publishes.
 * Tolerates duplicate runs, overlapping pages, out-of-order mail, provider
 * outages and rate limits: the cursor only advances after a complete listing,
 * and message processing retries with backoff independently of the cursor.
 */

import { classifyByRules } from "@/lib/email-intake/classify";
import { isAllowedSender } from "@/lib/email-intake/config";
import { findDuplicateSignals, type ExistingRecruitingItem } from "@/lib/email-intake/duplicates";
import { emptyExtraction, validateExtraction, type RawExtractedField } from "@/lib/email-intake/extraction";
import { capText, htmlToText } from "@/lib/email-intake/normalize";
import {
  EmailProviderError,
  type EmailIntakeProvider,
  type ProviderMessage,
} from "@/lib/email-intake/provider";
import type { IntakeRepository, ProcessingResult } from "@/lib/email-intake/repository";
import type {
  ClassificationResult,
  ExtractionFieldKey,
  IntakeAttachment,
  IntakeClassification,
  IntakeMessage,
} from "@/lib/email-intake/types";
import { extractDocumentText } from "@/lib/documents/text-extraction";

export type IntakeAI = {
  model: string;
  /** Optional: when absent, rule classification stands (still routed to human review). */
  classify?(input: { subject: string | null; text: string; threadContext: string }): Promise<Omit<ClassificationResult, "source">>;
  extract(input: {
    subject: string | null;
    body: string;
    attachments: string;
    thread: string;
  }): Promise<Partial<Record<ExtractionFieldKey, RawExtractedField>>>;
};

export type RecruitingLookup = {
  listRequisitions(): Promise<ExistingRecruitingItem[]>;
  listJobs(): Promise<ExistingRecruitingItem[]>;
};

export type IntakeLogEvent = {
  event:
    | "sync-started"
    | "sync-locked"
    | "messages-discovered"
    | "message-skipped"
    | "message-ingested"
    | "message-classified"
    | "review-item-created"
    | "duplicate-suspected"
    | "processing-failed"
    | "sync-completed"
    | "sync-failed";
  sourceId?: string;
  intakeId?: string;
  count?: number;
  reason?: string;
  classification?: string;
  errorKind?: string;
};

export type PipelineDeps = {
  provider: EmailIntakeProvider;
  repo: IntakeRepository;
  ai: IntakeAI | null;
  recruiting: RecruitingLookup;
  workerId: string;
  initialSyncAfter: Date;
  allowedSenders: string[];
  now?: () => Date;
  log?: (event: IntakeLogEvent) => void;
  pageSize?: number;
  maxMessagesPerRun?: number;
  overlapMinutes?: number;
  maxAttempts?: number;
};

export type SyncSummary = {
  status: "OK" | "PARTIAL" | "FAILED" | "LOCKED";
  discovered: number;
  ingested: number;
  skipped: number;
  processed: number;
  failed: number;
  error?: string;
};

const MAX_ATTACHMENTS = 3;
const ATTACHMENT_TEXT_CHARS = 12_000;

export function backoffAt(attempt: number, now: Date): Date {
  const minutes = Math.min(60, 2 ** Math.max(0, attempt - 1));
  return new Date(now.getTime() + minutes * 60_000);
}

function safeError(error: unknown): string {
  if (error instanceof EmailProviderError) return `provider:${error.kind}: ${error.message}`;
  if (error instanceof Error) return error.message.slice(0, 300);
  return "unknown error";
}

export async function syncEmailIntake(deps: PipelineDeps): Promise<SyncSummary> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => {});
  const pageSize = deps.pageSize ?? 50;
  const maxMessages = deps.maxMessagesPerRun ?? 200;
  const overlapMs = (deps.overlapMinutes ?? 60) * 60_000;
  const { provider, repo } = deps;

  const sourceId = `${provider.name}:${provider.accountId}:${provider.folderId}`;
  const source = await repo.ensureSource({
    id: sourceId,
    provider: provider.name,
    providerAccountId: provider.accountId,
    providerFolderId: provider.folderId,
    mailboxAddress: null,
    folderName: null,
    initialSyncAfter: deps.initialSyncAfter.toISOString(),
  });

  const started = now();
  if (!(await repo.acquireSyncLock(sourceId, deps.workerId, new Date(started.getTime() + 10 * 60_000), started))) {
    log({ event: "sync-locked", sourceId });
    return { status: "LOCKED", discovered: 0, ingested: 0, skipped: 0, processed: 0, failed: 0 };
  }
  log({ event: "sync-started", sourceId });

  const floor = Math.max(
    Date.parse(source.initialSyncAfter),
    source.syncCursorReceivedAt ? Date.parse(source.syncCursorReceivedAt) - overlapMs : 0,
  );

  const summary: SyncSummary = { status: "OK", discovered: 0, ingested: 0, skipped: 0, processed: 0, failed: 0 };
  let listingComplete = false;
  let cursor: string | null = source.syncCursorReceivedAt;

  try {
    // 1. Discover: page newest → oldest until we pass the floor.
    const discovered: ProviderMessage[] = [];
    let start = 1;
    for (;;) {
      const page = await provider.listMessages({ start, limit: pageSize });
      if (page.length === 0) {
        listingComplete = true;
        break;
      }
      let reachedFloor = false;
      for (const message of page) {
        if (Date.parse(message.receivedAt) < floor) {
          reachedFloor = true;
          continue; // keep scanning this page: Zoho order is by date but be tolerant
        }
        discovered.push(message);
      }
      if (reachedFloor || page.length < pageSize) {
        listingComplete = true;
        break;
      }
      if (discovered.length >= maxMessages) break; // remaining pages next run
      start += page.length;
    }
    summary.discovered = discovered.length;
    log({ event: "messages-discovered", sourceId, count: discovered.length });

    // 2. Record idempotently, oldest first.
    discovered.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
    for (const message of discovered) {
      if (message.folderId !== provider.folderId || !isAllowedSender(message.fromAddress, deps.allowedSenders)) {
        summary.skipped++;
        log({ event: "message-skipped", sourceId, reason: message.folderId !== provider.folderId ? "folder" : "sender-not-allowed" });
        continue;
      }
      const { inserted, id } = await repo.insertMessageIfNew(
        {
          sourceId,
          provider: provider.name,
          providerAccountId: provider.accountId,
          providerFolderId: message.folderId,
          providerMessageId: message.providerMessageId,
          providerThreadId: message.providerThreadId,
          fromAddress: message.fromAddress,
          fromName: message.fromName,
          toAddresses: message.toAddresses,
          ccAddresses: message.ccAddresses,
          subject: message.subject,
          receivedAt: message.receivedAt,
          hasAttachments: message.hasAttachments,
        },
        now(),
      );
      if (inserted) {
        summary.ingested++;
        log({ event: "message-ingested", sourceId, intakeId: id });
        await repo.addEvent(
          { intakeMessageId: id, sourceId, eventType: "INGESTED", actorType: "SYSTEM", actorProfileId: null, requisitionId: null, detail: {} },
          now(),
        );
      }
      if (!cursor || message.receivedAt > cursor) cursor = message.receivedAt;
    }
  } catch (error) {
    const message = safeError(error);
    summary.status = "FAILED";
    summary.error = message;
    log({ event: "sync-failed", sourceId, errorKind: error instanceof EmailProviderError ? error.kind : "unknown" });
    await repo.addEvent(
      { intakeMessageId: null, sourceId, eventType: "SYNC_FAILED", actorType: "SYSTEM", actorProfileId: null, requisitionId: null, detail: { error: message } },
      now(),
    );
    // Keep the previous cursor: nothing is skipped after an outage.
    await repo.finishSync(sourceId, deps.workerId, { status: "FAILED", cursor: source.syncCursorReceivedAt, error: message }, now());
    return summary;
  }

  // 3. Process pending messages (new ones and due retries).
  const pending = await repo.claimForProcessing(maxMessages, deps.workerId, now(), deps.maxAttempts ?? 5);
  for (const message of pending) {
    try {
      const result = await processMessage(message, deps);
      await repo.saveProcessingResult(message.id, deps.workerId, result, now());
      summary.processed++;
    } catch (error) {
      summary.failed++;
      const reason = safeError(error);
      const retryable = !(error instanceof EmailProviderError && error.kind === "not_found");
      const exhausted = message.attemptCount >= (deps.maxAttempts ?? 5);
      await repo.recordProcessingFailure(
        message.id,
        deps.workerId,
        reason,
        retryable && !exhausted ? backoffAt(message.attemptCount, now()) : null,
        now(),
      );
      await repo.addEvent(
        { intakeMessageId: message.id, sourceId, eventType: "PROCESSING_FAILED", actorType: "SYSTEM", actorProfileId: null, requisitionId: null, detail: { error: reason, attempt: message.attemptCount } },
        now(),
      );
      log({ event: "processing-failed", sourceId, intakeId: message.id, errorKind: error instanceof EmailProviderError ? error.kind : "processing" });
    }
  }

  summary.status = !listingComplete || summary.failed > 0 ? "PARTIAL" : "OK";
  await repo.finishSync(sourceId, deps.workerId, { status: summary.status === "OK" ? "OK" : "PARTIAL", cursor, error: null }, now());
  await repo.addEvent(
    { intakeMessageId: null, sourceId, eventType: "SYNC_COMPLETED", actorType: "SYSTEM", actorProfileId: null, requisitionId: null, detail: { ...summary } },
    now(),
  );
  log({ event: "sync-completed", sourceId, count: summary.processed });
  return summary;
}

async function readAttachments(
  message: IntakeMessage,
  provider: EmailIntakeProvider,
): Promise<{ records: IntakeAttachment[]; text: string }> {
  if (!message.hasAttachments) return { records: [], text: "" };
  const infos = await provider.getAttachments(message.providerMessageId);
  const records: IntakeAttachment[] = [];
  const texts: string[] = [];
  for (const [index, info] of infos.entries()) {
    const name = info.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 200);
    const base = { providerAttachmentId: info.providerAttachmentId, name, size: info.size, mimeType: null, textChars: 0 };
    if (index >= MAX_ATTACHMENTS) {
      records.push({ ...base, status: "SKIPPED", reason: `only the first ${MAX_ATTACHMENTS} attachments are read` });
      continue;
    }
    if (!/\.(pdf|docx|doc|txt)$/i.test(name)) {
      records.push({ ...base, status: "SKIPPED", reason: "unsupported file type" });
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = await provider.downloadAttachment(message.providerMessageId, info);
    } catch (error) {
      if (error instanceof EmailProviderError && (error.kind === "unavailable" || error.kind === "rate_limit" || error.kind === "auth")) throw error;
      records.push({ ...base, status: "REJECTED", reason: "could not be downloaded within the size limit" });
      continue;
    }
    const extracted = await extractDocumentText({ fileName: name, bytes });
    if (!extracted.ok) {
      records.push({ ...base, status: extracted.reason === "unreadable" || extracted.reason === "no_text" ? "FAILED" : "REJECTED", reason: extracted.reason.replace(/_/g, " ") });
      continue;
    }
    const text = extracted.text.slice(0, ATTACHMENT_TEXT_CHARS);
    records.push({ ...base, status: "EXTRACTED", textChars: text.length });
    texts.push(`--- Attachment: ${name} ---\n${text}`);
  }
  return { records, text: texts.join("\n\n") };
}

const JOB_CLASSES: ReadonlySet<IntakeClassification> = new Set(["JOB_REQUIREMENT", "JOB_UPDATE"]);

export async function processMessage(message: IntakeMessage, deps: PipelineDeps): Promise<ProcessingResult> {
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => new Date());
  const { provider, repo } = deps;

  const body = capText(htmlToText(await provider.getMessage(message.providerMessageId)), 12_000);
  const attachments = await readAttachments(message, provider);

  const thread = message.providerThreadId
    ? (await repo.listThread(message.provider, message.providerAccountId, message.providerThreadId)).filter(
        (m) => m.id !== message.id && m.receivedAt <= message.receivedAt,
      )
    : [];
  const threadContext = thread
    .map((m) => `[${m.receivedAt}] ${m.subject ?? ""}\n${(m.normalizedText ?? "").slice(0, 1500)}`)
    .join("\n\n")
    .slice(0, 6000);

  let classification: ClassificationResult = classifyByRules({
    subject: message.subject,
    text: `${body}\n${attachments.text}`,
    threadHasJobRequirement: thread.some((m) => m.classification && JOB_CLASSES.has(m.classification)),
    attachmentNames: attachments.records.map((a) => a.name),
  });
  const ambiguous = classification.confidence < 0.8;
  if (ambiguous && deps.ai?.classify) {
    const ai = await deps.ai.classify({ subject: message.subject, text: `${body}\n${attachments.text}`.slice(0, 12_000), threadContext });
    classification = { ...ai, source: "AI", reasons: [...ai.reasons, ...classification.reasons.map((r) => `rule: ${r}`)] };
  }
  log({ event: "message-classified", intakeId: message.id, classification: classification.classification });

  let extraction = null;
  if (JOB_CLASSES.has(classification.classification)) {
    extraction = deps.ai
      ? validateExtraction(
          await deps.ai.extract({ subject: message.subject, body, attachments: attachments.text, thread: threadContext }),
          { subject: message.subject, body, attachments: attachments.text, thread: threadContext },
        )
      : emptyExtraction("AI extraction is not configured — fill the fields from the email.");
  }

  const duplicateSignals = JOB_CLASSES.has(classification.classification)
    ? findDuplicateSignals({
        message,
        extraction,
        threadMessages: thread,
        recentIntake: await repo.listForDuplicateCheck(new Date(now().getTime() - 120 * 86_400_000)),
        requisitions: await deps.recruiting.listRequisitions(),
        jobs: await deps.recruiting.listJobs(),
      })
    : [];
  if (duplicateSignals.length) log({ event: "duplicate-suspected", intakeId: message.id, count: duplicateSignals.length });

  // Only a confident non-recruiting match is filed away automatically, and it
  // stays visible under "Ignored". Everything else waits for a recruiter.
  const autoIgnore = classification.classification === "NON_RECRUITING" && classification.confidence >= 0.9;
  const normalizedText = capText([body, attachments.text].filter(Boolean).join("\n\n"));

  await repo.addEvent(
    { intakeMessageId: message.id, sourceId: message.sourceId, eventType: "CLASSIFIED", actorType: "SYSTEM", actorProfileId: null, requisitionId: null,
      detail: { classification: classification.classification, confidence: classification.confidence, source: classification.source } },
    now(),
  );
  if (extraction) {
    await repo.addEvent(
      { intakeMessageId: message.id, sourceId: message.sourceId, eventType: "EXTRACTED", actorType: "SYSTEM", actorProfileId: null, requisitionId: null,
        detail: { model: deps.ai?.model ?? null, warnings: extraction.warnings.length } },
      now(),
    );
  }
  if (duplicateSignals.length) {
    await repo.addEvent(
      { intakeMessageId: message.id, sourceId: message.sourceId, eventType: "DUPLICATE_SUSPECTED", actorType: "SYSTEM", actorProfileId: null, requisitionId: null,
        detail: { signals: duplicateSignals.map((s) => s.kind) } },
      now(),
    );
  }
  if (!autoIgnore) log({ event: "review-item-created", intakeId: message.id });

  return {
    normalizedText,
    attachments: attachments.records,
    classification: classification.classification,
    classificationConfidence: Math.round(classification.confidence * 1000) / 1000,
    classificationSource: classification.source,
    classificationReasons: classification.reasons.slice(0, 8),
    extraction,
    extractionModel: extraction && deps.ai ? deps.ai.model : null,
    duplicateSignals,
    processingStatus: autoIgnore ? "IGNORED" : "REVIEW_REQUIRED",
  };
}
