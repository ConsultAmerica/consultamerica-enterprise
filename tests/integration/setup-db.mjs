// Builds the isolated integration database (LOCAL Supabase only).
//   node tests/integration/setup-db.mjs [--container supabase_db_sbtest] [--stage pre048|full]
// Refuses to run against anything but a local Docker container.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const container = arg("container", "supabase_db_sbtest");
const stage = arg("stage", "full");
if (!/^supabase_db_[\w-]+$/.test(container)) throw new Error("Refusing: not a local supabase_db_* container");

const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const lines = (rel, from, to) => read(rel).split(/\r?\n/).slice(from - 1, to).join("\n");

const parts = [
  ["reset", `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
   GRANT ALL ON SCHEMA public TO postgres, service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, service_role;
   SET storage.allow_delete_query = 'true'; DELETE FROM storage.objects; DELETE FROM storage.buckets; DELETE FROM auth.users;
   DROP POLICY IF EXISTS candidate_documents_owner_rw ON storage.objects; DROP POLICY IF EXISTS candidate_resumes_owner_rw ON storage.objects;
   DROP POLICY IF EXISTS candidate_documents_owner_read ON storage.objects; DROP POLICY IF EXISTS candidate_documents_owner_insert ON storage.objects;
   DROP POLICY IF EXISTS candidate_resumes_owner_read ON storage.objects; DROP POLICY IF EXISTS candidate_resumes_owner_insert ON storage.objects;
   DROP POLICY IF EXISTS candidate_documents_staff_read ON storage.objects; DROP POLICY IF EXISTS candidate_resumes_staff_read ON storage.objects;
   DROP TRIGGER IF EXISTS objects_protect_submitted_documents ON storage.objects;
   DROP TRIGGER IF EXISTS objects_protect_submitted_documents_update ON storage.objects;`],
  ["bootstrap", read("tests/integration/sql/000_bootstrap.sql")],
  ["019 identity helpers (verbatim)", `SET check_function_bodies = off;\n${lines("db/schema/019_rls_security_pass.sql", 1, 144)}`],
  ["013 candidate_profiles + applications policies (verbatim)", `${lines("db/schema/013_rls.sql", 41, 48)}
${lines("db/schema/013_rls.sql", 110, 136)}`],
  ["019 document policies (verbatim)", lines("db/schema/019_rls_security_pass.sql", 251, 285)],
  ["014 buckets + staff read (verbatim)", `${lines("db/schema/014_storage_buckets.sql", 8, 15)}\n${lines("db/schema/014_storage_buckets.sql", 27, 35)}\n${lines("db/schema/014_storage_buckets.sql", 44, 52)}`],
  ["019 storage owner policies (verbatim)", lines("db/schema/019_rls_security_pass.sql", 800, 849)],
  ["016 one-primary-résumé index (verbatim)", lines("db/schema/016_candidate_documents_fields.sql", 32, 34)],
  ["020 submitted-document immutability (verbatim)", read("db/schema/020_application_document_immutability.sql")],
  ["045", read("db/schema/045_recruiting_intelligence_and_email_intake.sql")],
  ["046", read("db/schema/046_candidate_portal_drafts_and_resume_review.sql")],
];
if (stage === "full") parts.push(["048", read("db/schema/048_candidate_document_write_restrictions.sql")]);

for (const [name, sql] of parts) {
  try {
    execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], {
      input: sql,
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log(`applied: ${name}`);
  } catch (e) {
    console.error(`FAILED: ${name}\n${e.stderr?.toString() ?? e.message}`);
    process.exit(1);
  }
}
execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-q"], { input: "NOTIFY pgrst, 'reload schema';" });
console.log(`database ready (stage=${stage})`);
