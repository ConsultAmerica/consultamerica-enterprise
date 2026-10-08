import { syncEmailIntake } from "@/lib/email-intake/pipeline";
import { getIntakeRuntime, intakeLog } from "@/lib/email-intake/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled incremental mailbox sync. Same convention as functional-source
 * crons: `Authorization: Bearer ${CRON_SECRET}`, rejected when unset.
 * Zoho Mail documents no inbound-message webhook, so this polls with a
 * durable cursor; duplicate or overlapping runs are safe (sync lock +
 * idempotent inserts).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let runtime;
  try {
    runtime = getIntakeRuntime();
  } catch (error) {
    intakeLog({ event: "config-error", error: error instanceof Error ? error.message : "unknown" });
    return Response.json({ status: "not-configured" }, { status: 503 });
  }
  if (!runtime.provider) return Response.json({ status: "disabled" });

  const summary = await syncEmailIntake({
    provider: runtime.provider,
    repo: runtime.repo,
    ai: runtime.ai,
    recruiting: runtime.recruiting,
    workerId: `cron-${crypto.randomUUID()}`,
    initialSyncAfter: runtime.config.initialSyncAfter,
    allowedSenders: runtime.config.allowedSenders,
    log: intakeLog,
  });
  return Response.json({ status: summary.status, discovered: summary.discovered, ingested: summary.ingested, processed: summary.processed, failed: summary.failed });
}
