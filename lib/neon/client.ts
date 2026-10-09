/**
 * Neon Postgres access for the Consult America recruitment system.
 *
 * Two transports, because Neon offers two and they are good at different jobs:
 *
 *   * HTTP one-shot (`neon()`), used by `sql` and `query`. One round trip per
 *     statement, no connection to keep alive, which is what a serverless
 *     function wants for the single SELECT that renders a page.
 *   * Pooled WebSocket (`Pool`), used by `tx`. A real interactive session, so
 *     BEGIN / statements / COMMIT run on one connection. The HTTP transport
 *     cannot do that: its `sql.transaction([...])` takes a fixed array of
 *     queries up front, so it cannot branch on what an earlier statement
 *     returned. Every write path here needs to branch, so every write path
 *     uses the pool.
 *
 * Nothing in this file ever interpolates a caller-supplied value into SQL
 * text. Both transports take values as bind parameters only.
 */

import {
  neon,
  neonConfig,
  Pool,
  type NeonQueryFunction,
  type PoolClient,
  type WebSocketConstructor,
} from "@neondatabase/serverless";

/**
 * Thrown when the database connection string is absent. It is deliberately a
 * distinct type so a health check can tell "not configured" apart from
 * "configured but unreachable".
 */
export class NeonConfigError extends Error {
  readonly code = "NEON_NOT_CONFIGURED" as const;

  constructor(message: string) {
    super(message);
    this.name = "NeonConfigError";
  }
}

/**
 * Vercel's Neon integration injects the same connection string under more than
 * one name, and which ones appear depends on how the store was attached. Read
 * both rather than making the deploy depend on that detail.
 *
 * There is no demo or in-memory fallback on purpose. A recruitment system that
 * silently accepts an application and writes it nowhere is worse than one that
 * refuses to start: the candidate gets a confirmation and the role gets no
 * applicant, and nobody finds out for weeks.
 */
function requireConnectionString(): string {
  const value = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

  if (!value || value.trim() === "") {
    throw new NeonConfigError(
      "No Neon connection string found. Set DATABASE_URL (preferred) or POSTGRES_URL " +
        "to the Neon pooled connection string. Both are normally provided by the Vercel " +
        "Neon integration; locally, copy one into .env.local.",
    );
  }

  return value;
}

/**
 * A thing that can run a parameterised statement. Both the HTTP transport and a
 * transaction satisfy it, which is what lets every function in this directory
 * take an optional runner and so compose into a caller's transaction instead of
 * opening its own.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<T[]>;
}

/**
 * A tagged-template query. Interpolated values become bind parameters, never
 * SQL text, so `sql\`... WHERE email = ${userInput}\`` is safe by construction.
 *
 * The row type is not inferable from the template, so callers name it:
 * `await sql<JobRow>\`SELECT * FROM jobs\``.
 */
export type SqlTag = <T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: readonly unknown[]
) => Promise<T[]>;

// Both transports are created on first use rather than at module load, so
// importing this file in a build step or a unit test does not require a
// connection string to exist.
let httpSql: NeonQueryFunction<false, false> | null = null;

function getHttpSql(): NeonQueryFunction<false, false> {
  if (!httpSql) {
    httpSql = neon(requireConnectionString());
  }
  return httpSql;
}

export const sql: SqlTag = (strings, ...values) =>
  // The driver's own overload is typed as Record<string, any>[]; the cast only
  // narrows that to the row shape the caller asked for.
  getHttpSql()(strings, ...values) as unknown as Promise<never[]>;

/**
 * Run one parameterised statement over HTTP and return its rows.
 *
 * `text` is expected to be a literal in this codebase. Values always arrive via
 * `params` as `$1`, `$2`, ... and are bound by the server.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const rows = await getHttpSql().query(text, params as unknown[]);
  return rows as unknown as T[];
}

/** The default runner: HTTP, no transaction. */
export const db: Queryable = { query };

let poolPromise: Promise<Pool> | null = null;

async function createPool(): Promise<Pool> {
  // The pooled transport speaks the Postgres wire protocol over a WebSocket.
  // Node 22 (what package.json pins in `engines`) exposes a global WebSocket;
  // Node 20 and below do not, and a developer running the older local Node
  // would otherwise see an opaque driver error. `ws` is already a dependency
  // of this project, so fall back to it. Imported lazily so the module is only
  // resolved on runtimes that actually need it.
  if (typeof globalThis.WebSocket === "undefined") {
    try {
      const nodeWebSocket = await import("ws");
      neonConfig.webSocketConstructor =
        nodeWebSocket.default as unknown as WebSocketConstructor;
    } catch {
      throw new NeonConfigError(
        "This runtime has no global WebSocket and the 'ws' package could not be loaded, " +
          "so pooled transactions are unavailable. Run Node 22 or later.",
      );
    }
  }

  return new Pool({
    connectionString: requireConnectionString(),
    // Serverless instances are many and short-lived, so each one wants a small
    // pool. A large max per instance multiplies into Neon's connection limit.
    max: 4,
    // Release idle connections quickly: an instance that handled one request
    // and went cold should not hold a session open behind it.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

function getPool(): Promise<Pool> {
  if (!poolPromise) {
    poolPromise = createPool().catch((error: unknown) => {
      // Do not cache a rejected promise: a transient import or config failure
      // would otherwise poison every later request on this instance.
      poolPromise = null;
      throw error;
    });
  }
  return poolPromise;
}

/** The runner handed to a `tx` callback. */
export interface TxClient extends Queryable {
  /** Tagged-template form, identical semantics to the module-level `sql`. */
  sql: SqlTag;
  /** The underlying pooled connection, for the rare case that needs it. */
  readonly connection: PoolClient;
}

/**
 * Build the parameterised form of a tagged template.
 *
 * Values are replaced by positional placeholders, so the only thing that ever
 * reaches the SQL text is the literal fragments the developer typed.
 */
function toParameterised(
  strings: TemplateStringsArray,
  values: readonly unknown[],
): { text: string; params: readonly unknown[] } {
  let text = "";
  for (let i = 0; i < strings.length; i += 1) {
    text += strings[i];
    if (i < values.length) {
      text += `$${i + 1}`;
    }
  }
  return { text, params: values };
}

function makeTxClient(client: PoolClient): TxClient {
  const run = async <T = Record<string, unknown>>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> => {
    const result = await client.query(text, params as unknown[]);
    return result.rows as T[];
  };

  const tagged: SqlTag = (strings, ...values) => {
    const { text, params } = toParameterised(strings, values);
    return run(text, params) as Promise<never[]>;
  };

  return { query: run, sql: tagged, connection: client };
}

/**
 * Run `fn` inside a single real Postgres transaction on one pooled connection.
 *
 * Any throw rolls back. The connection is always returned to the pool, even if
 * the rollback itself fails, because leaking a connection per error would take
 * the pool down within a few bad requests.
 */
export async function tx<T>(fn: (t: TxClient) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await fn(makeTxClient(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection may already be dead, in which case the server has
      // aborted the transaction for us. Surfacing this would mask the real
      // error, which is the one the caller needs.
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Postgres SQLSTATE for unique_violation. */
export const UNIQUE_VIOLATION = "23505";

/** Postgres SQLSTATE for foreign_key_violation, which ON DELETE RESTRICT raises. */
export const FOREIGN_KEY_VIOLATION = "23503";

/** True when `error` is the Postgres error with the given SQLSTATE. */
export function isPgError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when `value` is a syntactically valid UUID.
 *
 * Worth checking before a lookup by id, because a UUID column comparison casts
 * the parameter and Postgres raises invalid_text_representation on a malformed
 * one. That turns `/careers/not-a-uuid` into a 500 where it should be a 404, so
 * the id readers here screen the value first and report a miss instead.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Escape the LIKE/ILIKE wildcards in a user-supplied search term.
 *
 * Without this, searching for "50%" matches everything and searching for "a_b"
 * matches "axb". Not a security issue (the term is still a bind parameter) but
 * it makes search behave the way a recruiter expects.
 */
export function likePattern(term: string): string {
  const escaped = term.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

/**
 * Serialise reference-number allocation.
 *
 * A transaction-scoped advisory lock, released automatically at COMMIT or
 * ROLLBACK, so a crashed request cannot wedge the allocator. See the comment on
 * `nextReference` in jobs.ts for why this exists.
 */
export async function lockForReference(t: Queryable, namespace: number): Promise<void> {
  await t.query("SELECT pg_advisory_xact_lock($1, $2)", [REFERENCE_LOCK_CLASS, namespace]);
}

/**
 * First half of every advisory lock key this app takes. Picked arbitrarily but
 * fixed, so a lock taken here can never collide with one taken by unrelated
 * code sharing the same database.
 */
const REFERENCE_LOCK_CLASS = 918_273;

/** Advisory lock namespaces, one per reference series. */
export const ReferenceLock = {
  JOB: 1,
  APPLICATION: 2,
} as const;
