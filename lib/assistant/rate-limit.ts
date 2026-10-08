import "server-only";

import { createHash } from "node:crypto";

import { getSupabaseServiceClient } from "@/app/lib/supabase/server";

/**
 * Fixed-window rate limiting for the public assistant, shared across server
 * instances through a private Supabase table (db/schema/045). Visitors are
 * keyed by a salted SHA-256 of their IP; raw IPs are never stored or logged.
 */

export type RateLimitStore = {
  /** Records one hit; resolves true when the request is within the limit. */
  hit(bucket: string, windowSeconds: number, limit: number): Promise<boolean>;
};

export const VISITOR_LIMIT = { windowSeconds: 10 * 60, limit: 20 } as const;
export const GLOBAL_LIMIT = { windowSeconds: 24 * 60 * 60, limit: 3000 } as const;

class MissingRateLimitStore extends Error {}

export function visitorBucket(ip: string, salt: string): string {
  return `visitor:${createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 40)}`;
}

export function createMemoryRateLimitStore(now: () => number = Date.now): RateLimitStore {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    async hit(bucket, windowSeconds, limit) {
      const t = now();
      const windowMs = windowSeconds * 1000;
      const start = t - (t % windowMs);
      const key = `${bucket}|${start}`;
      const entry = windows.get(key) ?? { start, count: 0 };
      entry.count += 1;
      windows.set(key, entry);
      if (windows.size > 5000) {
        for (const [k, v] of windows) if (v.start < start) windows.delete(k);
      }
      return entry.count <= limit;
    },
  };
}

function createSupabaseRateLimitStore(): RateLimitStore {
  return {
    async hit(bucket, windowSeconds, limit) {
      const client = getSupabaseServiceClient();
      if (!client) throw new MissingRateLimitStore("Supabase not configured");
      const { data, error } = await client.rpc("assistant_rate_limit_hit", {
        p_bucket: bucket,
        p_window_seconds: windowSeconds,
        p_limit: limit,
      });
      if (error) {
        // PGRST202: function not found (migration 045 not applied yet).
        if (error.code === "PGRST202" || error.code === "42883") throw new MissingRateLimitStore(error.message);
        throw new Error(`rate limit store failed (${error.code}): ${error.message}`);
      }
      return data === true;
    },
  };
}

const memoryFallback = createMemoryRateLimitStore();
let warnedFallback = false;

export type RateLimitDecision = { allowed: true } | { allowed: false; reason: "visitor" | "global" | "store-unavailable" };

export const RATE_LIMIT_SCOPES = {
  assistant: { visitor: VISITOR_LIMIT, global: GLOBAL_LIMIT },
  "resume-prefill": { visitor: { windowSeconds: 60 * 60, limit: 10 }, global: { windowSeconds: 24 * 60 * 60, limit: 1000 } },
  // Candidate activation-link requests: per client IP, and (keyed by the
  // normalized email instead of an IP) per address, so one inbox can't be flooded.
  "candidate-access": { visitor: { windowSeconds: 60 * 60, limit: 5 }, global: { windowSeconds: 24 * 60 * 60, limit: 2000 } },
  "candidate-access-email": { visitor: { windowSeconds: 60 * 60, limit: 3 }, global: { windowSeconds: 24 * 60 * 60, limit: 5000 } },
} as const;

export async function checkAssistantRateLimit(
  ip: string,
  options: { store?: RateLimitStore; production?: boolean } = {},
): Promise<RateLimitDecision> {
  return checkPublicRateLimit("assistant", ip, options);
}

/** Per-visitor + global fixed windows for an anonymous public endpoint. */
export async function checkPublicRateLimit(
  scope: keyof typeof RATE_LIMIT_SCOPES,
  ip: string,
  options: { store?: RateLimitStore; production?: boolean } = {},
): Promise<RateLimitDecision> {
  const limits = RATE_LIMIT_SCOPES[scope];
  const prefix = scope === "assistant" ? "" : `${scope}:`;
  const production = options.production ?? process.env.NODE_ENV === "production";
  const salt = process.env.ASSISTANT_RATE_LIMIT_SALT || "consult-america-assistant";
  const primary = options.store ?? createSupabaseRateLimitStore();

  const run = async (store: RateLimitStore): Promise<RateLimitDecision> => {
    if (!(await store.hit(`${prefix}${visitorBucket(ip, salt)}`, limits.visitor.windowSeconds, limits.visitor.limit))) {
      return { allowed: false, reason: "visitor" };
    }
    if (!(await store.hit(`${prefix}global`, limits.global.windowSeconds, limits.global.limit))) {
      return { allowed: false, reason: "global" };
    }
    return { allowed: true };
  };

  try {
    return await run(primary);
  } catch (error) {
    if (!production && error instanceof MissingRateLimitStore) {
      if (!warnedFallback) {
        warnedFallback = true;
        console.warn("[ai-careers]", { event: "rate-limit-memory-fallback", reason: "migration 045 not applied" });
      }
      return run(memoryFallback);
    }
    // Fail closed in production: an unmetered public AI endpoint is not acceptable.
    console.error("[ai-careers]", {
      event: "rate-limit-store-failure",
      error: error instanceof Error ? error.message : String(error),
    });
    return { allowed: false, reason: "store-unavailable" };
  }
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
