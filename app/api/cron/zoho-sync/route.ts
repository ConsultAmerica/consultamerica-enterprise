import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Drain the Zoho CRM outbox. Switched off.
 *
 * WHY. The integration worked and nobody read it: two candidate records ever
 * reached Zoho and neither was looked at again. See ZOHO_SYNC_ENABLED in
 * lib/neon/crm.ts for the full reasoning.
 *
 * WHY THE ROUTE STILL EXISTS. The Vercel Cron schedule calls this URL, and a
 * schedule pointing at a 404 is a daily error nobody can act on. It answers
 * honestly instead, and turning the integration back on is restoring one
 * function rather than rebuilding a worker. The draining implementation is
 * untouched in lib/zoho/sync.ts.
 *
 * WHY IT RETURNS BEFORE READING ANYTHING. This is what lets the two Zoho
 * tables be dropped. The old body called claimDueSyncJobs on every run, which
 * SELECTs from zoho_sync_queue, and that table is removed in
 * db/neon/005_cleanup.sql. A scheduled job querying a dropped table is an
 * error every hour, forever.
 *
 * STILL AUTHENTICATED. The check costs nothing and keeps the shape of the
 * endpoint honest: an unauthenticated caller should never learn anything about
 * this deployment's integrations, including that one was removed.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  /*
    503 and "disabled", which is deliberately not "not-configured". Those are
    different facts: not-configured means a deployment has no CRM credentials
    and might want some, disabled means the integration was removed on purpose.
    A health check should be able to tell them apart.
  */
  return Response.json(
    { status: "disabled", reason: "Zoho CRM integration removed" },
    { status: 503 },
  );
}

/**
 * Constant-time comparison against CRON_SECRET.
 *
 * Unchanged from the working version. timingSafeEqual throws on a length
 * mismatch, hence the length check first, and the lengths themselves are not
 * secret.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (presented.length !== secret.length) return false;

  return timingSafeEqual(Buffer.from(presented), Buffer.from(secret));
}
