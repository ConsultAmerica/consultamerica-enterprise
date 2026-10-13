import { afterEach, describe, expect, it } from "vitest";

import {
  currentDatabaseName,
  isProductionDatabase,
  neonConsoleUrl,
  neonRecordQueryUrl,
  neonTableUrl,
  recordSql,
} from "@/lib/neon/console-link";

/**
 * The "View in Neon DB" links.
 *
 * TWO THINGS THESE TESTS EXIST TO PROVE, because neither can be checked by
 * loading the console: that a link never points at the wrong database, and
 * that nothing from the connection string except the database name ever
 * reaches a link. Everything else about the console is unverifiable from here,
 * since it redirects every unauthenticated request to /sign_in including
 * requests for routes that do not exist.
 *
 * THE CREDENTIALS BELOW ARE FAKE. They are shaped like the real connection
 * string so that the extraction is exercised against something realistic, and
 * the point of the final test is that none of these parts come out the other
 * side. The real string lives in .env.local and Vercel and is not in any file
 * under version control.
 */

const LOCAL =
  "postgresql://neondb_owner:npg_FAKEpassword123@ep-fake-endpoint-a1b2c3d4-pooler.us-east-1.aws.neon.tech/ca_localdev?sslmode=require";
const PRODUCTION =
  "postgresql://neondb_owner:npg_FAKEpassword123@ep-fake-endpoint-a1b2c3d4-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require";

const ORIGINAL = {
  DATABASE_URL: process.env.DATABASE_URL,
  POSTGRES_URL: process.env.POSTGRES_URL,
};

function connectTo(url: string | undefined) {
  if (url === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = url;
  // POSTGRES_URL is the documented fallback, so it has to be out of the way
  // for the "no database configured" case to actually be that case.
  delete process.env.POSTGRES_URL;
}

afterEach(() => {
  if (ORIGINAL.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL.DATABASE_URL;
  if (ORIGINAL.POSTGRES_URL === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = ORIGINAL.POSTGRES_URL;
});

describe("which database the link points at", () => {
  it("reads ca_localdev from a developer connection string", () => {
    connectTo(LOCAL);
    expect(currentDatabaseName()).toBe("ca_localdev");
    expect(isProductionDatabase()).toBe(false);
  });

  it("reads neondb from the production connection string", () => {
    connectTo(PRODUCTION);
    expect(currentDatabaseName()).toBe("neondb");
    expect(isProductionDatabase()).toBe(true);
  });

  it("puts that database name in the link, so the two cannot disagree", () => {
    connectTo(LOCAL);
    expect(neonTableUrl("applications")).toContain("database=ca_localdev");
    connectTo(PRODUCTION);
    expect(neonTableUrl("applications")).toContain("database=neondb");
  });

  it("strips the query string off the database name", () => {
    // ?sslmode=require is present on every Neon string. Parsed naively it
    // becomes part of the name and every link points at a database that does
    // not exist.
    connectTo(LOCAL);
    expect(currentDatabaseName()).not.toContain("sslmode");
  });

  it("falls back to POSTGRES_URL when DATABASE_URL is absent", () => {
    connectTo(undefined);
    process.env.POSTGRES_URL = PRODUCTION;
    expect(currentDatabaseName()).toBe("neondb");
  });
});

/**
 * The URL shape, pinned because getting it wrong produced links that looked
 * fine and were all dead.
 *
 * The console routes Tables and the SQL Editor UNDER a branch. An earlier
 * version of this module built /app/projects/<id>/sql-editor with no branch
 * segment, which the console answers with "Not found" rather than a redirect,
 * so every link it generated 404'd and nothing in the type system or the test
 * suite noticed.
 *
 * The ids below were read from the Neon API against the Consult America
 * account on 2026-10-12. The endpoint on that project, ep-hidden-tree-b7bc4r4t,
 * is the same host DATABASE_URL points at, which is what ties these links to
 * the database the application actually reads.
 */
describe("console URL shape", () => {
  const id = "11111111-2222-3333-4444-555555555555";

  const BRANCH = "/app/projects/lively-dew-34491258/branches/br-hidden-salad-b7z9kk6b";

  it("addresses the project, the branch and the view, in that order", () => {
    connectTo(LOCAL);
    expect(neonTableUrl("applications")).toContain(`${BRANCH}/tables`);
    expect(neonRecordQueryUrl("applications", id)).toContain(`${BRANCH}/sql-editor`);
  });

  /**
   * The two destinations, and why they differ.
   *
   * A list screen has no record, so the SQL editor would open empty with
   * nothing to paste into it. A record panel has a statement and offers it as
   * Copy SQL, so the editor is where that statement is useful. Sending both to
   * one view would leave one of them pointless.
   */
  it("sends a list to the tables view and a record to the editor", () => {
    connectTo(LOCAL);
    expect(neonConsoleUrl("tables")).toContain(`${BRANCH}/tables`);
    expect(neonConsoleUrl("sql-editor")).toContain(`${BRANCH}/sql-editor`);
    expect(neonTableUrl("jobs")).toBe(neonConsoleUrl("tables"));
  });

  /**
   * `?table=` was sent and is silently ignored by the console: every link
   * opened on whatever table sorts first, admin_password_resets, no matter
   * which record the reader clicked from. Watched happening in the console on
   * 2026-10-12. `?database=` was watched working in the same session, which is
   * why one stays and the other is gone.
   */
  it("sends the database, which works, and not the table, which does not", () => {
    connectTo(LOCAL);
    const url = new URL(neonTableUrl("applications")!);
    expect(url.searchParams.get("database")).toBe("ca_localdev");
    expect(url.searchParams.has("table")).toBe(false);
  });

  it("gives every table the same destination, because the console has no per-table URL", () => {
    connectTo(LOCAL);
    const urls = (["jobs", "candidates", "applications", "interviews"] as const).map((t) =>
      neonTableUrl(t),
    );
    expect(new Set(urls).size).toBe(1);
  });

  it("never omits the branch segment", () => {
    // The exact regression. A path that goes straight from the project id to
    // the view is the dead shape.
    connectTo(LOCAL);
    for (const url of [neonTableUrl("jobs"), neonRecordQueryUrl("jobs", id)]) {
      expect(url).not.toMatch(/\/projects\/[^/]+\/(tables|sql-editor)/);
      expect(url).toMatch(/\/projects\/[^/]+\/branches\/[^/]+\/(tables|sql-editor)/);
    }
  });
});

describe("no link rather than a wrong link", () => {
  it("returns null when no database is configured", () => {
    // Null is what suppresses the link in the UI. A guess here would send
    // somebody to production believing they were looking at test data.
    connectTo(undefined);
    expect(currentDatabaseName()).toBeNull();
    expect(neonTableUrl("jobs")).toBeNull();
    expect(neonRecordQueryUrl("jobs", "11111111-2222-3333-4444-555555555555")).toBeNull();
    expect(isProductionDatabase()).toBe(false);
  });

  it("returns null for a connection string it cannot parse", () => {
    connectTo("this is not a url");
    expect(currentDatabaseName()).toBeNull();
    expect(neonTableUrl("candidates")).toBeNull();
  });

  it("returns null when the string has a host but no database", () => {
    connectTo("postgresql://user:pw@ep-fake-endpoint.us-east-1.aws.neon.tech/");
    expect(currentDatabaseName()).toBeNull();
    expect(neonTableUrl("candidates")).toBeNull();
  });
});

describe("the statement that finds the record", () => {
  const id = "11111111-2222-3333-4444-555555555555";

  it("is a plain single-row select the reader can paste anywhere", () => {
    // This is the part that works regardless of whether the console reads
    // anything out of the URL, which is why the dashboard shows it behind a
    // copy control.
    expect(recordSql("applications", id)).toBe(
      `SELECT * FROM applications WHERE id = '${id}';`,
    );
  });

  it("reads nothing from the environment", () => {
    // Correct whichever database is connected, so it must not go null the way
    // the URL builders do.
    connectTo(undefined);
    expect(recordSql("interviews", id)).toContain(id);
  });

  it("is the same statement the link carries, so the two cannot drift", () => {
    connectTo(LOCAL);
    const url = neonRecordQueryUrl("applications", id);
    expect(url).not.toBeNull();
    expect(new URL(url!).searchParams.get("query")).toBe(recordSql("applications", id));
  });

  it("builds for every allowlisted table and names it once", () => {
    for (const table of ["jobs", "candidates", "applications", "interviews"] as const) {
      expect(recordSql(table, id)).toBe(`SELECT * FROM ${table} WHERE id = '${id}';`);
    }
  });
});

/**
 * The table name and the id are the only two values this feature places into
 * SQL text by hand, because SQL has no placeholder for an identifier. Both are
 * typed at the call sites, and a type is erased at runtime, so these are the
 * tests that the runtime checks are really there.
 *
 * The casts below are the point of the exercise. They stand in for a value
 * arriving from a route segment, a JSON body or a webhook, which is the only
 * way a bad argument could reach these functions in the first place.
 */
describe("table allowlist", () => {
  const id = "11111111-2222-3333-4444-555555555555";

  it("refuses a table outside the four", () => {
    connectTo(LOCAL);
    for (const table of ["admin_users", "admin_sessions", "zoho_oauth_tokens"]) {
      expect(recordSql(table as never, id)).toBeNull();
      expect(neonTableUrl(table as never)).toBeNull();
      expect(neonRecordQueryUrl(table as never, id)).toBeNull();
    }
  });

  it("refuses an injected identifier instead of concatenating it", () => {
    connectTo(LOCAL);
    const injected = "applications; DROP TABLE applications; --";
    expect(recordSql(injected as never, id)).toBeNull();
    expect(neonRecordQueryUrl(injected as never, id)).toBeNull();
  });

  it("refuses a non-string table", () => {
    connectTo(LOCAL);
    for (const table of [undefined, null, 7, {}, ["jobs"]]) {
      expect(recordSql(table as never, id)).toBeNull();
      expect(neonTableUrl(table as never)).toBeNull();
    }
  });
});

describe("record id validation", () => {
  it("accepts a canonical uuid in either case", () => {
    // Every one of the four tables is id UUID PRIMARY KEY DEFAULT
    // gen_random_uuid() in db/neon/001_init.sql, so this shape is what a real
    // id always looks like and the check cannot reject live data.
    connectTo(LOCAL);
    expect(recordSql("jobs", "0f8fad5b-d9cb-469f-a165-70867728950e")).not.toBeNull();
    expect(recordSql("jobs", "0F8FAD5B-D9CB-469F-A165-70867728950E")).not.toBeNull();
  });

  it("refuses an id that could carry sql out of the quotes", () => {
    connectTo(LOCAL);
    const hostile = [
      "' OR '1'='1",
      "11111111-2222-3333-4444-555555555555'; DROP TABLE jobs; --",
      "11111111-2222-3333-4444-555555555555 OR true",
      "'; DELETE FROM applications WHERE true; --",
      "11111111-2222-3333-4444-555555555555--comment",
    ];
    for (const id of hostile) {
      expect(recordSql("jobs", id)).toBeNull();
      expect(neonRecordQueryUrl("jobs", id)).toBeNull();
    }
  });

  it("refuses an id that is merely the wrong shape", () => {
    connectTo(LOCAL);
    const wrong = [
      "",
      "   ",
      "1",
      "not-a-uuid",
      "11111111-2222-3333-4444-55555555555", // one digit short
      "11111111-2222-3333-4444-5555555555555", // one digit long
      "gggggggg-2222-3333-4444-555555555555", // not hex
      " 11111111-2222-3333-4444-555555555555", // padded
      "11111111222233334444555555555555", // unhyphenated
    ];
    for (const id of wrong) {
      expect(recordSql("jobs", id)).toBeNull();
      expect(neonRecordQueryUrl("jobs", id)).toBeNull();
    }
  });

  it("refuses a non-string id", () => {
    connectTo(LOCAL);
    for (const id of [undefined, null, 7, {}, []]) {
      expect(recordSql("jobs", id as never)).toBeNull();
      expect(neonRecordQueryUrl("jobs", id as never)).toBeNull();
    }
  });

  it("never emits a statement containing a quote, semicolon or comment marker beyond the literal", () => {
    // A generated statement is exactly one select with one quoted literal.
    // Two quotes, one semicolon, no double dash.
    connectTo(LOCAL);
    const sql = recordSql("applications", "0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(sql).not.toBeNull();
    expect(sql!.match(/'/g)).toHaveLength(2);
    expect(sql!.match(/;/g)).toHaveLength(1);
    expect(sql).not.toContain("--");
    expect(sql).not.toContain("/*");
  });
});

describe("nothing secret leaves this module", () => {
  const id = "11111111-2222-3333-4444-555555555555";

  it("never emits the password, user, host or connection string", () => {
    connectTo(PRODUCTION);
    const emitted = [
      neonTableUrl("applications"),
      neonTableUrl("candidates"),
      neonTableUrl("jobs"),
      neonTableUrl("interviews"),
      neonRecordQueryUrl("applications", id),
      recordSql("applications", id),
      currentDatabaseName(),
    ].join("\n");

    for (const secret of [
      "npg_FAKEpassword123",
      "neondb_owner",
      "ep-fake-endpoint-a1b2c3d4-pooler",
      "aws.neon.tech",
      "sslmode",
      PRODUCTION,
    ]) {
      expect(emitted).not.toContain(secret);
    }
  });

  it("emits only the console host", () => {
    connectTo(PRODUCTION);
    for (const url of [neonTableUrl("jobs"), neonRecordQueryUrl("jobs", id)]) {
      expect(new URL(url!).host).toBe("console.neon.tech");
    }
  });
});
