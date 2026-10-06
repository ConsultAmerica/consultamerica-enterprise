import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client using the public anon key. Not used by the
 * Workforce App shell/dashboard yet (those are server-rendered) — kept for
 * parity so future client components have a ready factory.
 */

let cachedClient: SupabaseClient | null | undefined;

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Demo UI (module chooser, open portals, demo banners) is allowed only in a
 * non-production build that has no Supabase public credentials.
 * Production never enters this mode, even when those env vars are missing.
 */
export function isExplicitDemoMode(): boolean {
  return process.env.NODE_ENV !== "production" && !isSupabaseBrowserConfigured();
}

/**
 * Every session module falls back to a hardcoded, fully-privileged demo
 * identity (e.g. full ADMIN/RECRUITER/HR) when Supabase isn't configured —
 * useful for local dev with no `.env.local`, but that same fallback would
 * silently grant unauthenticated full access if the env vars were ever
 * missing in a real deployment. Fail loudly there instead of guessing.
 */
export function assertDemoSessionAllowed(context: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `Refusing to grant an unauthenticated demo session (${context}) in production: ` +
        `NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured.`,
    );
  }
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  if (!isSupabaseBrowserConfigured()) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );

  return cachedClient;
}
