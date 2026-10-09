import { timingSafeEqual } from "node:crypto";

import { NeonConfigError, connectionStringStatus, query } from "@/lib/neon/client";
import { logServerError } from "@/lib/observability/logger";

// node:crypto for the constant-time secret comparison, and the Neon driver for
// the probe. Neither exists on the edge runtime.
export const runtime = "nodejs";
// A cached health check is not a health check. Without this, the first answer
// would be served to every later caller and could report a database that has
// since gone away.
export const dynamic = "force-dynamic";

/**
 * Is this deployment's database reachable?
 *
 * WHY THIS ENDPOINT EXISTS. Admin sign-in failed in production with
 * "Sign-in is temporarily unavailable" while the identical code and the
 * identical database worked on localhost. The cause turned out to be that the
 * production deployment had neither DATABASE_URL nor POSTGRES_URL set, so the
 * first query threw NeonConfigError — but from outside the function there was
 * no way to see that. Every failure mode of /admin/login produces the same
 * sentence, Vercel's log API returned nothing useful, and the admin pages that
 * would have reported the condition all sit behind the login that was broken.
 * Finding it took a bisect. This endpoint makes it one request.
 *
 * THE THREE STATES IT DISTINGUISHES, which is the whole point — they look
 * identical at the login form and have completely different fixes:
 *
 *   503 not-configured   No connection string in this runtime. Fix: set
 *                        DATABASE_URL on the project and REDEPLOY. Environment
 *                        variables are read at boot, so a running deployment
 *                        never picks up a new one on its own.
 *   503 unreachable      Configured, but the probe failed. Fix: Neon's status,
 *                        the project's compute, or the connection string's
 *                        correctness. `error` names the exception class only.
 *   200 ok               Configured and answering, with the latency.
 *
 * WHAT IT DELIBERATELY DOES NOT RETURN: the connection string, any part of it,
 * the host, the database name, the user, or any exception message. An endpoint
 * built to diagnose a credential problem is the last place a credential should
 * be printed. `databaseUrl` is a boolean and `source` is a variable NAME
 * ("DATABASE_URL"), which is public information already in .env.example.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    // 401 with no body detail: an unauthenticated caller learns only that the
    // route is guarded, not whether the database behind it is healthy. A health
    // endpoint that answered everyone would be a free monitor of when this
    // company's recruitment system is down, which is useful to precisely one
    // kind of visitor.
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { present, source } = connectionStringStatus();

  if (!present) {
    return Response.json(
      {
        status: "not-configured",
        databaseUrl: false,
        source: null,
        checkedAt: new Date().toISOString(),
        hint:
          "No connection string in this runtime. Set DATABASE_URL (or POSTGRES_URL) " +
          "on the Vercel project for this environment, then redeploy — environment " +
          "variables are read at boot.",
      },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  try {
    // `SELECT 1` and nothing else. The probe has to cost the database almost
    // nothing, because whatever polls this will poll it often, and it must not
    // depend on any table — a schema that has not been migrated yet is a
    // different fault and should not be reported as an unreachable database.
    const rows = await query<{ ok: number }>("SELECT 1 AS ok");
    const latencyMs = Date.now() - startedAt;

    if (rows[0]?.ok !== 1) {
      // Answered, but not with what was asked for. Worth its own branch: it
      // means something is terminating the connection and replying — a proxy,
      // a pooler in a bad state — not that Postgres is down.
      return Response.json(
        {
          status: "unexpected-result",
          databaseUrl: true,
          source,
          select1: false,
          latencyMs,
          checkedAt: new Date().toISOString(),
        },
        { status: 503 },
      );
    }

    return Response.json({
      status: "ok",
      databaseUrl: true,
      source,
      select1: true,
      latencyMs,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    // Full detail (name, message, code, cause chain, stack) goes to the log and
    // the ref comes back, so the caller can quote four characters rather than
    // this endpoint having to choose how much of an exception is safe to print.
    const ref = logServerError("admin-health/select-1", error, {
      source: source ?? "none",
      latencyMs,
    });

    return Response.json(
      {
        // NeonConfigError here would mean the string is present but unusable
        // (empty after trimming, say), which is a configuration fault rather
        // than an outage even though we got past the `present` check above.
        status: error instanceof NeonConfigError ? "not-configured" : "unreachable",
        databaseUrl: true,
        source,
        select1: false,
        latencyMs,
        checkedAt: new Date().toISOString(),
        // The class name only. Enough to tell a DNS failure from a timeout from
        // an auth rejection when read alongside the log line, and it carries no
        // host, user or credential.
        error: error instanceof Error ? error.name : "unknown",
        ref,
      },
      { status: 503 },
    );
  }
}

/**
 * Accept Vercel's scheduler or a bearer token, and nothing else.
 *
 * Copied deliberately from app/api/cron/zoho-sync/route.ts rather than
 * generalised: that file documents the reasoning (Vercel strips
 * client-supplied `x-vercel-*` headers at the edge, so the header can only have
 * been added by the platform), and the two routes should not be able to drift
 * apart silently through a shared helper one of them stops matching.
 *
 * FAILS CLOSED. With CRON_SECRET unset, every request is rejected — including
 * from an operator who needs the answer. That is the correct direction to be
 * wrong in for an endpoint that reports infrastructure state, but it does mean
 * CRON_SECRET must be set on the project for this to be usable at all.
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
