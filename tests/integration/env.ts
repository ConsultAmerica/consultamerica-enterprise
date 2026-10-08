import { vi } from "vitest";

/**
 * Points the server code at the local, isolated Supabase started by
 * `supabase start`. Values default to the Supabase CLI's well-known local
 * development keys; override with INTEGRATION_SUPABASE_* if needed.
 */
const url = process.env.INTEGRATION_SUPABASE_URL ?? "http://127.0.0.1:54321";
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error(`Integration tests only run against a local Supabase, not ${host}`);
}

process.env.NEXT_PUBLIC_SUPABASE_URL = url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.INTEGRATION_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.INTEGRATION_SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
process.env.NEXT_PUBLIC_SITE_URL = process.env.INTEGRATION_SITE_URL ?? "http://127.0.0.1:3211";
process.env.INTEGRATION_MAILPIT_URL ??= "http://127.0.0.1:54324";

vi.mock("server-only", () => ({}));
