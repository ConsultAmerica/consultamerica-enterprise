// Applies db/neon/*.sql in filename order over the UNPOOLED connection.
// Unpooled on purpose: pgbouncer in transaction mode rejects some DDL and
// session-level statements, and DO $$ ... $$ blocks are exactly that case.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING;
if (!url) throw new Error("Set DATABASE_URL_UNPOOLED");

const dir = "db/neon";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  for (const f of files) {
    process.stdout.write(`applying ${f} ... `);
    await client.query(readFileSync(join(dir, f), "utf8"));
    console.log("ok");
  }
} finally {
  await client.end();
}
