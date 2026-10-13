import "server-only";

import { createHash } from "node:crypto";

/**
 * The rate limit on the public apply routes.
 *
 * MOVED HERE FROM app/jobs/[slug]/apply/actions.ts WHEN THE AI ROUTE WAS
 * ADDED, and the reason is a hole that appeared the moment there were two
 * doors. The limiter's windows live in a module-level Map, so a per-file copy
 * means a per-file budget: eight Easy Apply submissions AND eight AI interview
 * launches from one address in fifteen minutes, which is not the limit anyone
 * wrote down. One module, one Map, so the two routes spend from the same
 * allowance however the caller mixes them.
 *
 * In-process is a deliberate floor, not the finished article. The shared
 * limiter this repo already has (lib/assistant/rate-limit.ts) is backed by
 * Supabase, which is exactly what the apply path was moved off, and Neon has
 * no counter table in the schema. So: one window per server instance. On
 * Vercel that means a determined attacker spread across instances gets a
 * multiple of these numbers, which still turns an unbounded flood into a
 * bounded one. Move it to a Neon table when there is a reason to.
 *
 * Limits are sized for a real applicant, not an average one: a family or an
 * office behind one NAT address can legitimately file several applications in
 * an afternoon.
 */
const RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  perIp: 8,
  /** Backstop across all clients, so one window cannot drown the inbox. */
  global: 200,
} as const;

type Window = { startedAt: number; count: number };
const windows = new Map<string, Window>();

/** Salted hash: the limiter needs to tell clients apart, not to know who they are. */
function ipKey(ip: string): string {
  const salt = process.env.ASSISTANT_RATE_LIMIT_SALT || "consult-america-apply";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

function hit(key: string, limit: number, now: number): boolean {
  const start = now - (now % RATE_LIMIT.windowMs);
  const existing = windows.get(key);
  const window: Window =
    existing && existing.startedAt === start ? existing : { startedAt: start, count: 0 };
  window.count += 1;
  windows.set(key, window);

  // Bounded memory. Expired windows are dead weight once the clock moves on.
  if (windows.size > 10_000) {
    for (const [k, v] of windows) if (v.startedAt < start) windows.delete(k);
  }

  return window.count <= limit;
}

/**
 * Fails OPEN. A limiter that breaks and starts refusing genuine applicants
 * costs the business real candidates; a burst that gets through costs it a
 * noisy inbox for fifteen minutes. The asymmetry is not close.
 *
 * `onError` rather than an import of the logger, so this module stays free of
 * anything a caller might not want pulled in.
 */
export function withinApplyRateLimit(
  ip: string,
  onError?: (error: unknown) => void,
): boolean {
  try {
    const now = Date.now();
    if (!hit(`ip:${ipKey(ip)}`, RATE_LIMIT.perIp, now)) return false;
    return hit("global", RATE_LIMIT.global, now);
  } catch (error) {
    onError?.(error);
    return true;
  }
}

export function clientIp(requestHeaders: Headers): string {
  const forwarded = requestHeaders.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return requestHeaders.get("x-real-ip")?.trim() || "unknown";
}

/** The message both routes show a refused caller, so the two cannot drift. */
export const RATE_LIMITED_MESSAGE =
  "Too many applications from this connection. Please try again in a few minutes.";
