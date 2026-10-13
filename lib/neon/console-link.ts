/**
 * Links into the Neon console for a given record.
 *
 * WHY THIS IS A TABLE LINK AND NOT A ROW LINK. Neon's console has no concept
 * of a URL that opens one record. Its Tables view and SQL Editor are the only
 * destinations and neither accepts a row identifier, so the closest honest
 * thing is to open the right table in the right database and hand the reader
 * the id to search for. That is why every caller is expected to show the id
 * alongside the link with a copy control: the link gets you to the table, the
 * id gets you to the row.
 *
 * WHICH DATABASE. The same connection string the application is already using
 * decides it, so the link always points at the data the reader is actually
 * looking at: `ca_localdev` from a developer's machine, `neondb` in
 * production. Hardcoding either would send somebody to the wrong one at
 * exactly the moment they were trying to check something real.
 *
 * NO CREDENTIALS CROSS THIS BOUNDARY. Only the database NAME is taken from the
 * connection string, never the host, user or password, and the project id is
 * public information that appears in the Vercel integration page. The reader
 * still has to be signed in to Neon for the link to show them anything.
 *
 * LIMITS OF WHAT WAS VERIFIED. The console sits behind an auth gate that
 * redirects every unauthenticated request to /sign_in, including requests for
 * routes that do not exist, so a 302 from one of these URLs proves only that
 * the gate is working. It does not prove the path is real. Neon documents no
 * URL parameter for the Tables view or the SQL Editor, and whether the console
 * honours `database`, `table` or `query` could not be confirmed without a
 * signed-in session. They are sent as a best-effort hint: if the console reads
 * them the reader lands in the right place, and if it ignores them the reader
 * still lands in the right project rather than nowhere.
 *
 * The reliable path is the statement from `recordSql`, which callers show as
 * copyable text. No caller may describe one of these links as opening a
 * particular row, because none of them can.
 */

/**
 * Which project and branch the console links point at.
 *
 * VERIFIED AGAINST THE NEON API on 2026-10-12, against the Consult America
 * account (consultamerica.net@gmail.com), not a personal one:
 *
 *   organization  org-bold-art-38408078      "Vercel: Consult America"
 *   project       lively-dew-34491258        "ConsultAmerica-db"
 *   branch        br-hidden-salad-b7z9kk6b   main, the default branch
 *   databases     ca_localdev, neondb        both owned by neondb_owner
 *   endpoint      ep-hidden-tree-b7bc4r4t    the host in DATABASE_URL
 *
 * The endpoint is the proof. It is the same host the application connects to,
 * so these links and the running app are demonstrably pointed at one place
 * rather than two that happen to share a name.
 *
 * NEITHER VALUE IS A SECRET. A project id appears in the Vercel integration
 * page and a branch id in any console URL, and both are useless without an
 * account that can see the project. They are overridable by environment all
 * the same, so moving the database does not need a code change.
 */
const NEON_PROJECT_ID = process.env.NEON_PROJECT_ID || "lively-dew-34491258";
const NEON_BRANCH_ID = process.env.NEON_BRANCH_ID || "br-hidden-salad-b7z9kk6b";

const CONSOLE = "https://console.neon.tech/app/projects";

/**
 * The console path for one view of the branch.
 *
 * THE BRANCH SEGMENT IS REQUIRED and leaving it out was a real bug: the
 * console routes Tables and the SQL Editor under a branch, so
 * /app/projects/<id>/sql-editor renders "Not found" rather than redirecting.
 * Every link this module produced before carried that shape and every one of
 * them was dead.
 */
function branchPath(view: "tables" | "sql-editor"): string {
  return `${CONSOLE}/${NEON_PROJECT_ID}/branches/${NEON_BRANCH_ID}/${view}`;
}

/**
 * Tables the dashboard offers a console link for.
 *
 * AN ALLOWLIST, NOT A HINT. The table name is the one part of the statement
 * that cannot be parameterised, since SQL has no placeholder for an
 * identifier, so it is concatenated into the text. TypeScript narrows it at
 * the call sites inside this repo, but a type is erased at runtime and says
 * nothing about a value that arrived from a route segment, a JSON body or a
 * webhook. This array is checked at runtime so the set of names that can ever
 * reach a generated statement is exactly these four and is fixed at build
 * time.
 */
const NEON_TABLES = ["jobs", "candidates", "applications", "interviews"] as const;

export type NeonTable = (typeof NEON_TABLES)[number];

/** True when `value` is one of the four allowlisted table names. */
function isNeonTable(value: unknown): value is NeonTable {
  return typeof value === "string" && (NEON_TABLES as readonly string[]).includes(value);
}

/**
 * Canonical UUID, the only id shape any of these tables has.
 *
 * Every one of the four is declared `id UUID PRIMARY KEY DEFAULT
 * gen_random_uuid()` in db/neon/001_init.sql, so a well-formed id is always
 * 8-4-4-4-12 hex and anything else did not come from the database. Validating
 * the shape means the quoted literal in the statement cannot contain a quote,
 * a semicolon, a comment marker or whitespace, which is what makes the
 * concatenation safe rather than merely conventional.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecordId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * The database the app is connected to right now.
 *
 * Parsed from DATABASE_URL rather than configured separately, so it cannot
 * drift from reality. Returns null when the string is absent or unparseable,
 * which is what suppresses the link rather than rendering a wrong one.
 */
export function currentDatabaseName(): string | null {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!raw) return null;
  try {
    const name = new URL(raw).pathname.replace(/^\/+/, "").split("?")[0];
    return name || null;
  } catch {
    return null;
  }
}

/**
 * The console link shown for a given table, or null when it cannot be built
 * honestly.
 *
 * The table is validated but NOT put in the URL: see `neonConsoleUrl`, the
 * console ignores a table parameter. The argument is kept because every call
 * site knows which table it is about and because validating it here keeps a
 * bad name from reaching any part of this module.
 *
 * Null rather than a best guess: a link that opens the wrong database is worse
 * than no link, because somebody will read production figures believing they
 * are looking at test data, or edit test data believing it is production.
 */
export function neonTableUrl(table: NeonTable): string | null {
  if (!isNeonTable(table)) return null;
  /*
    The TABLES view, because a list screen has no record and therefore nothing
    to paste. Sending a reader to the SQL editor from here would open an empty
    editor with no statement to put in it. Tables at least shows data in the
    right database, and the table they want is one click down the sidebar.

    The record panel is the opposite case and goes to the editor: it has a
    statement, offered beside the link as Copy SQL.
  */
  return neonConsoleUrl("tables");
}

/**
 * A console URL for one view of the right database, or null when the database
 * cannot be determined.
 *
 * ONLY `database` IS SENT, and only because it was watched working: loading
 * the Tables view with `?database=ca_localdev` selects that database in the
 * console. `?table=` was sent too at first and is silently ignored, so every
 * link opened on whatever table sorts first, `admin_password_resets`,
 * regardless of which record the reader had clicked from. A parameter that
 * does nothing is worse than no parameter, because the panel appears to
 * promise a destination it cannot reach.
 *
 * THE SQL EDITOR IS THE DESTINATION for the record panel, since the console
 * offers no way to preselect a table and no way to address a row. Landing in
 * the editor for the right database is one paste away from the record, which
 * is what makes Copy SQL and this link one workflow rather than two half
 * measures.
 */
export function neonConsoleUrl(view: "tables" | "sql-editor"): string | null {
  const database = currentDatabaseName();
  if (!database) return null;
  const url = new URL(branchPath(view));
  url.searchParams.set("database", database);
  return url.toString();
}

/**
 * The statement that finds one record, as text.
 *
 * This is the part that actually works, and it is why the feature does not
 * hinge on an undocumented URL parameter. The console may or may not read a
 * query out of a link, but a reader who can see the statement can always paste
 * it into whatever editor they are given. Callers render it with a copy
 * control, or as selectable text where there is no clipboard, as in email.
 *
 * Does not consult the environment, because the statement is correct whichever
 * database is connected. Callers that need to name the database ask
 * `currentDatabaseName` separately.
 *
 * VALIDATED, NOT TRUSTED. The table is checked against the allowlist and the
 * id against the UUID shape before either is concatenated, and anything that
 * fails returns null. The arguments are typed, but a type is gone at runtime
 * and these two values are the only things placed into SQL text by hand
 * anywhere in this feature, so they are checked rather than assumed. Null is
 * the same signal the URL builders use, so a caller already handles it.
 */
export function recordSql(table: NeonTable, id: string): string | null {
  if (!isNeonTable(table) || !isRecordId(id)) return null;
  return `SELECT * FROM ${table} WHERE id = '${id}';`;
}

/**
 * A SQL Editor URL carrying the record query as a hint.
 *
 * NOT RENDERED ANYWHERE TODAY, and that is a decision rather than an
 * oversight. Whether the console reads `query` from the address bar is
 * undocumented and could not be confirmed, and putting a statement in an href
 * writes it into the page markup, the hover target and the address bar, which
 * is exactly what the Database record panel is meant to avoid. The panel links
 * to the table and offers Copy SQL instead.
 *
 * Kept because it is the only thing resembling a row link that could ever
 * exist here, so if Neon documents the parameter this is where that lands.
 */
export function neonRecordQueryUrl(table: NeonTable, id: string): string | null {
  const query = recordSql(table, id);
  if (!query) return null;
  const database = currentDatabaseName();
  if (!database) return null;
  const url = new URL(branchPath("sql-editor"));
  url.searchParams.set("database", database);
  url.searchParams.set("query", query);
  return url.toString();
}

/** True when the connected database is the one serving the public site. */
export function isProductionDatabase(): boolean {
  return currentDatabaseName() === "neondb";
}
