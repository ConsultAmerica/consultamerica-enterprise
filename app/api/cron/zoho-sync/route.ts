import { timingSafeEqual } from "node:crypto";

import { NeonConfigError } from "@/lib/neon/client";
import { DEFAULT_SYNC_BATCH, processDueSyncJobs } from "@/lib/zoho/sync";
import { isZohoConfigured } from "@/lib/zoho/token";

// The worker uses the pooled WebSocket transport and node:crypto, neither of
// which exists on the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Upper bound on ?limit=, matching the ceiling claimDueSyncJobs enforces. */
const MAX_LIMIT = 100;

/**
 * Drain the Zoho CRM outbox.
 *
 * Authenticated before it does anything. This endpoint spends a third party's
 * rate limit on every call, so leaving it open would let anyone on the internet
 * burn the day's API credits and take the CRM integration down for everybody —
 * and it would look like a Zoho problem, not an exposed route.
 *
 * Duplicate and overlapping runs are safe: claims use FOR UPDATE SKIP LOCKED,
 * so two workers get different rows, and the Zoho operation is an upsert matched
 * on email, so a repeat never creates a second contact.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isZohoConfigured()) {
    // 503, not 500: nothing is broken, this deployment simply has no CRM
    // connection. A health check should be able to tell those apart.
    return Response.json({ status: "not-configured" }, { status: 503 });
  }

  const limit = parseLimit(new URL(request.url).searchParams.get("limit"));

  try {
    const summary = await processDueSyncJobs(limit);
    return Response.json({ status: "ok", ...summary });
  } catch (error) {
    if (error instanceof NeonConfigError) {
      return Response.json({ status: "not-configured" }, { status: 503 });
    }
    // Per-job failures never reach here; processDueSyncJobs records them on the
    // queue and keeps going. Reaching here means the queue itself is
    // unreachable, so there is no state to update and nothing to report but the
    // reason.
    return Response.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * Accept Vercel's scheduler or a bearer token, and nothing else.
 *
 * Vercel strips client-supplied `x-vercel-*` headers at the edge, so the header
 * can only have been added by the platform. Fails closed: with CRON_SECRET
 * unset and no platform header, every request is rejected. Same convention as
 * app/api/cron/email-intake/route.ts.
 */
function isAuthorized(request: Request): boolean {
  if (request.headers.get("x-vercel-cron")) {
    return true;
  }

  const secret = process.env.CRON_SECRET;
  const presented = request.headers.get("authorization");
  if (!secret || secret.trim() === "" || !presented) {
    return false;
  }

  return constantTimeEquals(presented, `Bearer ${secret}`);
}

/**
 * Compare without leaking the answer through timing.
 *
 * The length check short-circuits, which reveals the secret's length and
 * nothing else. Byte content is compared in constant time.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function parseLimit(raw: string | null): number {
  if (raw === null) {
    return DEFAULT_SYNC_BATCH;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_SYNC_BATCH;
  }
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}
