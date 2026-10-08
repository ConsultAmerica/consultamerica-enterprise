import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Local-only helpers: service/anon clients, Mailpit inbox, synthetic fixtures. */

export const service = (): SupabaseClient =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const anon = (): SupabaseClient =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export const uid = () => Math.random().toString(36).slice(2, 10);
export const testEmail = (tag: string) => `${tag}.${uid()}@example.test`;

const MAILPIT = () => process.env.INTEGRATION_MAILPIT_URL!;

/** Waits for the newest email to `to` and returns its /auth/confirm link (token_hash form). */
export async function latestAuthLink(to: string, opts: { after?: string; timeoutMs?: number } = {}): Promise<URL> {
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT()}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const body = (await res.json()) as { messages?: { ID: string; Created: string }[] };
    const msg = (body.messages ?? []).filter((m) => !opts.after || m.Created > opts.after)[0];
    if (msg) {
      const detail = (await (await fetch(`${MAILPIT()}/api/v1/message/${msg.ID}`)).json()) as { HTML: string; Text: string };
      const html = (detail.HTML || detail.Text).replace(/&amp;/g, "&");
      const href = /href="([^"]*\/auth\/confirm\?[^"]+)"/.exec(html)?.[1];
      if (href) return new URL(href);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`no auth email for ${to}`);
}

export async function messageCount(to: string): Promise<number> {
  const res = await fetch(`${MAILPIT()}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  return ((await res.json()) as { messages_count?: number }).messages_count ?? 0;
}

export function check<T>(result: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.code ?? ""} ${result.error.message}`);
  return result.data;
}

/** Like check(), for reads that must return data. */
export function checkRow<T>(result: { data: T; error: { message: string; code?: string } | null }, what: string): NonNullable<T> {
  const data = check(result, what);
  if (data == null) throw new Error(`${what}: no data`);
  return data;
}

/** An open job (+ requisition) and a closed one, unique per call. */
export async function createJobs(db: SupabaseClient) {
  const tag = uid();
  const open = { req: `req-open-${tag}`, job: `job-open-${tag}`, slug: `open-role-${tag}` };
  const closed = { req: `req-closed-${tag}`, job: `job-closed-${tag}`, slug: `closed-role-${tag}` };
  check(
    await db.from("job_requisitions").insert([
      { id: open.req, title: "Integration Engineer", status: "OPEN" },
      { id: closed.req, title: "Closed Role", status: "CLOSED" },
    ]),
    "requisitions",
  );
  check(
    await db.from("jobs").insert([
      { id: open.job, requisition_id: open.req, slug: open.slug, title: "Integration Engineer", status: "PUBLISHED", published_at: "2026-01-01T00:00:00Z" },
      { id: closed.job, requisition_id: closed.req, slug: closed.slug, title: "Closed Role", status: "CLOSED", published_at: "2026-01-01T00:00:00Z" },
    ]),
    "jobs",
  );
  return { open, closed };
}

/** An applicant record created the way anonymous Easy Apply creates one (no portal link yet). */
export async function createApplicant(db: SupabaseClient, email: string) {
  const id = `cand-${uid()}`;
  check(await db.from("candidate_profiles").insert({ id, first_name: "Test", last_name: "Applicant", email }), "candidate");
  return id;
}

export const pdfBytes = () =>
  new TextEncoder().encode(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  );

/** An applicant who accepted their invitation: returns a signed-in anon-key client (candidate JWT). */
export async function activatedCandidate(db: SupabaseClient, tag = "cand") {
  const { provisionCandidatePortalAccount } = await import("@/lib/candidate/provisioning");
  const email = testEmail(tag);
  const candidateId = await createApplicant(db, email);
  await provisionCandidatePortalAccount({ candidateId, email, displayName: `Test ${tag}` });
  const link = await latestAuthLink(email);
  const client = anon();
  const verified = await client.auth.verifyOtp({ token_hash: link.searchParams.get("token_hash")!, type: "invite" });
  if (verified.error) throw new Error(`activation failed: ${verified.error.message}`);
  const cand = checkRow(await db.from("candidate_profiles").select("profile_id").eq("id", candidateId).single(), "cand");
  return { client, candidateId, profileId: cand.profile_id as string, email, authUserId: verified.data.user!.id };
}
