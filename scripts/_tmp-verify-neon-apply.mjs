import { Client } from "pg";

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const q = async (label, sql) => {
  const r = await c.query(sql);
  console.log(`\n### ${label} (${r.rowCount} rows)`);
  console.log(JSON.stringify(r.rows, null, 2));
};

for (const t of ["candidates", "applications", "application_activities", "zoho_sync_queue"]) {
  const r = await c.query(`SELECT count(*)::int AS n FROM ${t}`);
  console.log(`count ${t} = ${r.rows[0].n}`);
}

await q("candidates", "SELECT id, email, first_name, last_name, phone, location, linkedin_url, created_at FROM candidates ORDER BY created_at");
await q("applications", "SELECT a.id, a.reference, a.status, a.source, a.resume_url, a.resume_filename, a.resume_size_bytes, j.slug AS job_slug, c.email, a.applied_at FROM applications a JOIN jobs j ON j.id=a.job_id JOIN candidates c ON c.id=a.candidate_id ORDER BY a.applied_at");
await q("application_activities", "SELECT id, application_id, actor_id, kind, to_status, detail, created_at FROM application_activities ORDER BY created_at");
await q("zoho_sync_queue", "SELECT id, entity_type, entity_id, operation, status, attempts, next_attempt_at FROM zoho_sync_queue ORDER BY created_at");

await c.end();
