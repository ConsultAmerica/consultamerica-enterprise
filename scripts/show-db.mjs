/**
 * Prints what is in the recruitment database, readably.
 *
 * WHY THIS EXISTS. Looking at this data otherwise means either the Neon
 * console (which needs you to know which of two databases you are pointed at)
 * or psql (which needs you to know SQL). Both are fine for an engineer and
 * both are the wrong thing to put in front of someone who just asked "what is
 * actually in there".
 *
 * It reads DATABASE_URL, so it shows whichever database the app itself is
 * using. That is the point: if this prints ca_localdev, localhost is reading
 * ca_localdev. There is no way for the two to disagree.
 *
 *   npm run db:show            the local database
 *   npm run db:show -- --prod  production, read-only
 *
 * READS ONLY. There is no statement in this file that writes anything.
 */

import { neon } from "@neondatabase/serverless";

const wantProd = process.argv.includes("--prod");

const configured = process.env.DATABASE_URL;
if (!configured) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/show-db.mjs");
  process.exit(1);
}

/*
 * --prod swaps the database name in the connection string rather than reading
 * a second variable, because the two databases differ by nothing else. Done
 * explicitly so that running without the flag can never reach production by
 * accident.
 */
const url = wantProd ? configured.replace("/ca_localdev", "/neondb") : configured;
const sql = neon(url);

const B = (s) => `\x1b[1m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

function heading(text) {
  console.log(`\n${B(text)}\n${DIM("─".repeat(Math.max(text.length, 40)))}`);
}

try {
  const [{ db }] = await sql`SELECT current_database() AS db`;
  const isProd = db === "neondb";

  console.log();
  console.log(B(`  ${isProd ? "PRODUCTION" : "LOCAL"}  ·  database: ${db}`));
  console.log(
    DIM(
      isProd
        ? "  This is what consultamerica.com reads. Real candidates."
        : "  This is what localhost reads. Test data. The live site never sees it.",
    ),
  );

  heading("Tables");
  const tables = await sql`
    SELECT relname AS name, n_live_tup AS rows
      FROM pg_stat_user_tables
     WHERE schemaname = 'public'
     ORDER BY n_live_tup DESC, relname`;
  for (const t of tables) {
    console.log(`  ${String(t.rows).padStart(5)}  ${t.name}`);
  }

  heading("Jobs");
  const jobs = await sql`
    SELECT reference, title, status,
           (SELECT count(*)::int FROM applications a WHERE a.job_id = j.id) AS applicants
      FROM jobs j ORDER BY reference`;
  for (const j of jobs) {
    const live = j.status === "PUBLISHED" ? "live  " : "draft ";
    console.log(`  ${j.reference}  ${live} ${String(j.applicants).padStart(2)} applied   ${j.title}`);
  }

  heading("Candidates");
  const people = await sql`
    SELECT c.email,
           trim(c.first_name || ' ' || c.last_name) AS name,
           (SELECT count(*)::int FROM applications a WHERE a.candidate_id = c.id) AS applications
      FROM candidates c ORDER BY c.created_at`;
  for (const p of people) {
    console.log(`  ${String(p.applications).padStart(2)} applications   ${(p.name || "(no name)").padEnd(24)} ${p.email}`);
  }

  heading("Applications");
  const apps = await sql`
    SELECT a.reference, a.method, a.status, j.title,
           a.resume_filename IS NOT NULL AS has_cv,
           i.score
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      LEFT JOIN interviews i ON i.application_id = a.id AND i.kind = 'AI_SCREEN'
     ORDER BY a.applied_at`;
  for (const a of apps) {
    const how = a.method === "AI_INTERVIEW" ? "AI " : "form";
    const cv = a.has_cv ? "CV" : "  ";
    const score = a.score ? `${Number(a.score).toFixed(1)}/10` : "     ";
    console.log(`  ${a.reference}  ${how}  ${cv}  ${score}  ${a.status.padEnd(10)} ${a.title}`);
  }

  console.log();
} catch (error) {
  console.error("\nCould not read the database:", error.message, "\n");
  process.exit(1);
}
