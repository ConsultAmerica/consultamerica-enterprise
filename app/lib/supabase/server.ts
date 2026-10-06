import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import NodeWebSocket from "ws";

/**
 * Server-only Supabase access using the service-role key.
 * Every caller must handle a `null` client — this project runs without a
 * configured Supabase project until one is provisioned, and nothing here
 * may throw or crash a page render when that's the case.
 */

let cachedClient: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Production must never silently fall back to demo/in-memory data.
 * Call at app bootstrap / jobs routes when NODE_ENV === "production".
 */
export function assertProductionSupabaseConfigured(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (isSupabaseConfigured()) return;
  throw new Error(
    "Production misconfiguration: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Demo/in-memory mode is disabled in production.",
  );
}

export function getSupabaseServiceClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Production misconfiguration: Supabase is not configured. Refusing demo fallback.",
      );
    }
    cachedClient = null;
    return cachedClient;
  }

  // supabase-js always constructs a realtime client, which throws under a
  // Node runtime with no native WebSocket (Node <22 — matches scripts run
  // via tsx, e.g. scripts/process-notification-deliveries.ts). Next.js's own
  // server runtime has native WebSocket, so this only ever engages there.
  const realtime =
    typeof globalThis.WebSocket === "undefined"
      ? { realtime: { transport: NodeWebSocket as unknown as typeof globalThis.WebSocket } }
      : {};

  cachedClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false }, ...realtime },
  );

  return cachedClient;
}
