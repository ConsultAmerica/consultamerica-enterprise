/**
 * Resume profile backfill for resumes already in storage.
 *
 * SAFE BY DEFAULT: without flags this is a DRY RUN that only lists ACTIVE
 * RESUME documents that have no resume_profiles row. It never re-uploads,
 * moves, rewrites or deletes documents, and never changes applications.
 *
 * Processing requires BOTH:
 *   --apply                     and
 *   CONFIRM_RESUME_BACKFILL=yes  (environment)
 * Optional: --limit=N (default 25 per run). Rules-only parsing (no AI cost);
 * profiles can be re-parsed later with AI by the application.
 *
 * Usage (Node 22+, tsx resolves the @/ path aliases):
 *   npx tsx --env-file=.env.local scripts/backfill-resume-profiles.ts
 *   CONFIRM_RESUME_BACKFILL=yes npx tsx --env-file=.env.local scripts/backfill-resume-profiles.ts --apply --limit=10
 *
 * Requires migration 045 (resume_profiles). Separate approval is required
 * before running against production.
 */

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 25);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  if (apply && process.env.CONFIRM_RESUME_BACKFILL !== "yes") {
    throw new Error("Refusing to process: set CONFIRM_RESUME_BACKFILL=yes together with --apply");
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: docs, error } = await db
    .from("documents")
    .select("id, candidate_id, file_name, storage_path, uploaded_at")
    .eq("document_type", "RESUME")
    .eq("status", "ACTIVE")
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(`documents query failed (${error.code})`);

  const { data: existing, error: profileError } = await db.from("resume_profiles").select("document_id");
  if (profileError) throw new Error(`resume_profiles query failed (${profileError.code}) — is migration 045 applied?`);
  const done = new Set((existing ?? []).map((r) => r.document_id as string));
  const pending = (docs ?? []).filter((d) => !done.has(d.id as string));

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", resumes: docs?.length ?? 0, alreadyParsed: done.size, pending: pending.length }));
  if (!apply) {
    for (const d of pending.slice(0, limit)) console.log(`would parse ${d.id} (candidate ${d.candidate_id}, uploaded ${d.uploaded_at})`);
    return;
  }

  const { extractDocumentText } = await import("../lib/documents/text-extraction");
  const { parseResumeByRules, RESUME_PARSER_VERSION } = await import("../lib/recruiting/resume-parser");

  for (const d of pending.slice(0, limit)) {
    const id = `rp-${d.id}`;
    const base = { id, candidate_id: d.candidate_id, document_id: d.id, parsed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const { data: blob, error: dlError } = await db.storage.from("candidate-documents").download(d.storage_path as string);
    if (dlError || !blob) {
      console.log(`skip ${d.id}: download failed`);
      continue;
    }
    const extracted = await extractDocumentText({ fileName: d.file_name as string, bytes: new Uint8Array(await blob.arrayBuffer()) });
    const row: Record<string, unknown> = extracted.ok
      ? { ...base, status: "PARSED", parser_version: `${RESUME_PARSER_VERSION}+rules`, extracted_text: extracted.text, structured: parseResumeByRules(extracted.text), error: null }
      : { ...base, status: extracted.reason === "unsupported_type" ? "UNSUPPORTED" : "FAILED", parser_version: RESUME_PARSER_VERSION, extracted_text: null, structured: null, error: extracted.reason };
    const { error: upsertError } = await db.from("resume_profiles").upsert(row, { onConflict: "document_id", ignoreDuplicates: true });
    console.log(`${d.id}: ${upsertError ? `error ${upsertError.code}` : row.status}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
