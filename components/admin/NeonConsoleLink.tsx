import { CopyRecordSql, CopyToClipboard } from "@/components/admin/CopyToClipboard";
import { ResumeLink } from "@/components/admin/ResumeLink";
import type { AdminRole } from "@/lib/neon/auth";
import {
  currentDatabaseName,
  isProductionDatabase,
  neonConsoleUrl,
  neonTableUrl,
  recordSql,
  type NeonTable,
} from "@/lib/neon/console-link";

/**
 * The Database record panel, and the matching one-line table link for the list
 * screens.
 *
 * WHAT IT IS FOR. Every screen in this dashboard is a careful rendering of a
 * row, which is exactly the problem when the question is "what is actually
 * stored". A stage that will not move, a score that arrived as a string, a
 * candidate who exists twice: answering any of those means reading the row
 * itself, and the alternative is a developer hunting for a connection string,
 * which is the one thing nobody should be doing casually.
 *
 * WHY IT IS A PANEL AND NOT A FOOTNOTE. It was a block of small print under the
 * page at first, and it read as debugging output bolted onto a dashboard rather
 * than part of it. It is now a .ws-panel built from .ws-dl and .ws-btn, the same
 * card and controls as Owner, Interviews and CRM sync beside it, so it sits in
 * the layout as one more fact about the record. Quiet comes from where it is
 * placed and how little it says, not from making it look unfinished.
 *
 * WHAT IT DOES NOT SAY. It does not explain that Neon has no row URL, and it
 * does not print the statement. That reasoning belongs in lib/neon/console-link.ts,
 * where it is written out in full, and not in front of a recruiter working a
 * candidate. The one thing the copy must keep is an honest label: the link says
 * "Open in Neon console" and never claims to open this row, because it cannot.
 *
 * A server component. The only client code is the two copy buttons, which live
 * in their own file so that this module — which reads DATABASE_URL — never
 * crosses the boundary into a browser bundle.
 */

/**
 * Who may see any of this.
 *
 * OWNER and ADMIN: they are the accounts responsible for the whole desk, and
 * they are the accounts that get asked why a record looks wrong.
 *
 * RECRUITER: nothing. Not a greyed-out panel, not an explanation. Two reasons,
 * and the second is the real one. A recruiter has no use for the raw table:
 * they work the queue, and the dashboard is the correct and complete view of
 * it. More importantly the Neon console is an unconstrained read AND WRITE over
 * every table in the database, including admin_users and admin_sessions. The
 * dashboard's own authorization — whose applications a recruiter may open,
 * whose résumé they may read (see mayOpenResume in
 * app/admin/applications/[id]/resume/route.ts) — does not exist in there.
 * Pointing the lowest-privilege role at a door with no lock on it would make
 * every other check in this system decorative.
 *
 * This is NOT the security boundary and must not be mistaken for one: Neon's
 * own sign-in is. Somebody has to already hold a Neon account with access to
 * the project before any of this shows them a single row. This gate is about
 * not handing out the address, and it is the only gate in front of the panel
 * now that nothing else in the system carries a statement.
 *
 * Takes the role rather than the whole AdminSessionUser because the role is the
 * entire decision, and a component that cannot see an email address cannot
 * accidentally render one. Exported so the rule is nameable rather than a
 * condition repeated at five call sites.
 */
export function maySeeNeonConsole(role: AdminRole): boolean {
  return SHOW_NEON_CONSOLE && (role === "OWNER" || role === "ADMIN");
}

/**
 * Whether anything about the database appears in the dashboard at all.
 *
 * OFF, by request. Both the per-record panel and the list-screen footer are
 * withheld: the admin is a recruiting tool and the console links read as
 * plumbing left on show rather than part of the product.
 *
 * Nothing below was deleted, and neither was lib/neon/console-link.ts or its
 * tests. Flipping this to true restores the panel on the application, job and
 * candidate detail pages and the footer on the three list screens, still gated
 * to OWNER and ADMIN by the function above.
 *
 * THE RESUME IS NOT LOST WITH IT. The application detail page has its own
 * Résumé section, built from ResumeLink and ResumePreview, which is where a
 * recruiter reads a CV and is unaffected by this flag. The copy of the resume
 * pointer inside the panel was a second view of the same thing.
 */
const SHOW_NEON_CONSOLE = false;

/**
 * The database name, and a quiet marker when it is the live one.
 *
 * WHY THE NAME IS ON THE PANEL AT ALL. `ca_localdev` and `neondb` are two
 * databases in one Neon project, and the console remembers whichever was last
 * open. Someone who clicks through from a local dashboard, lands on a tab still
 * pointed at production and starts editing rows has done real damage while
 * believing they were in test data. The name answers that before the click.
 *
 * A tag and not a warning banner. Opening production is legitimate and happens
 * on purpose; what must not happen is doing it without noticing, and a chip the
 * eye catches is enough for that.
 *
 * Only the database NAME is ever rendered. The host, the user and the password
 * never leave the server: see the header of lib/neon/console-link.ts.
 */
function DatabaseValue({ database, production }: { database: string; production: boolean }) {
  return (
    <span className="ndb-value">
      <code className="ndb-chip">{database}</code>
      {production ? (
        <span className="ndb-chip is-live" title="The live database behind the public site.">
          Production
        </span>
      ) : null}
    </span>
  );
}

/**
 * The Database record panel for a detail page.
 *
 * One component for applications, candidates and jobs, driven by `table` and
 * `id`, so the three pages cannot drift into three slightly different panels.
 *
 * `table` and `id` must come from a database read, not from the request. They
 * are the only two values in this feature that reach SQL text, and recordSql
 * re-checks both — the table against its allowlist, the id against the uuid
 * shape — so a route segment passed in here would not produce a bad statement,
 * it would produce no panel. The call sites pass ids off a loaded row, which the
 * database has already matched.
 */
export function NeonRecordPanel({
  role,
  table,
  id,
  resume,
}: {
  role: AdminRole;
  table: NeonTable;
  id: string;
  /**
   * The three resume columns on an applications row, when there is one.
   *
   * WHY THE PANEL SHOWS THEM. "Where is the file actually stored" is the
   * question this panel exists to answer, and the resume is the one value in
   * the record that lives somewhere other than Postgres. The row holds a
   * pointer, not the document.
   */
  resume?: { url: string | null; filename: string | null; sizeBytes: number | null };
}) {
  if (!maySeeNeonConsole(role)) return null;

  const database = currentDatabaseName();
  /*
    The statement and the link go null together, because neonRecordQueryUrl
    builds its hint by calling recordSql: a table name off the allowlist or an
    id that is not a well-formed uuid suppresses both at once. Nothing honest is
    left to show in that case — an id the database could not have produced is
    not an id anybody should be copying — so the panel is omitted rather than
    degraded. The statement itself is NOT passed to the browser from here; see
    CopyRecordSql.
  */
  const sql = recordSql(table, id);
  /*
    The TABLE url, deliberately, not the one that carries the statement as a
    `query` parameter. Two reasons and they point the same way. The parameter
    is undocumented, so a link built around it is a guess about behaviour we
    could not confirm. And putting the statement in an href writes it into the
    document, which is the thing this panel is not supposed to do: it would
    still be absent from the visible page and present in the markup, on hover,
    and in the address bar after the click. Copy SQL is the way to the
    statement; the link is the way to the database.
  */
  const href = neonConsoleUrl("sql-editor");
  if (!database || !sql) return null;

  return (
    <section className="ws-panel ndb-panel">
      <h2>Database record</h2>
      {/* Flat dt/dd pairs, no wrapper elements: .ws-dl is a two-column grid
          whose children are the terms and descriptions themselves. */}
      <dl className="ws-dl">
        <dt>Database</dt>
        <dd>
          <DatabaseValue database={database} production={isProductionDatabase()} />
        </dd>
        <dt>Table</dt>
        <dd>
          <code className="ndb-chip">{table}</code>
        </dd>
        <dt>Record ID</dt>
        <dd>
          <span className="ndb-value">
            {/* user-select: all, so one click takes the whole uuid even where
                the clipboard API is unavailable. See CopyToClipboard.tsx. */}
            <code className="ndb-id">{id}</code>
            <CopyToClipboard value={id} label="Copy ID" describe="record id" small />
          </span>
        </dd>
        {resume ? (
          <>
            <dt>resume_url</dt>
            <dd>
              {resume.url ? (
                <span className="ndb-value ndb-stack">
                  {/*
                    THE STORED VALUE, AS TEXT, AND NOT AS A LINK. The bucket is
                    private (see lib/neon/resume-storage.ts), so this URL
                    answers "what is in the column" and nothing else: pasting
                    it into a browser returns 403 for everyone, including an
                    admin. Rendering it as an anchor would promise a document
                    and deliver a permission error, which is the exact
                    confusion this panel is supposed to end.
                  */}
                  <code className="ndb-id ndb-url">{resume.url}</code>
                  <span className="ndb-value">
                    <CopyToClipboard
                      value={resume.url}
                      label="Copy URL"
                      describe="blob url"
                      small
                    />
                    {/*
                      The link that works. Goes through the authorized route,
                      which re-checks the session and signs the blob for a few
                      minutes. This is the only sanctioned way to open a CV.
                    */}
                    <ResumeLink
                      applicationId={id}
                      resumeUrl={resume.url}
                      filename={resume.filename}
                      sizeBytes={resume.sizeBytes}
                    />
                  </span>
                </span>
              ) : (
                <span className="ws-muted">null, no resume was uploaded</span>
              )}
            </dd>
          </>
        ) : null}
      </dl>
      <div className="ndb-actions">
        <CopyRecordSql table={table} id={id} />
        {/*
          A plain <a>, not next/link: this is another origin, so there is no
          client-side navigation to prefetch. target="_blank" keeps the reader's
          place on the record they were working, and rel="noreferrer" stops the
          admin URL being handed to the console as a referrer.

          Guarded even though a non-null `sql` and a known database mean this is
          non-null: the helper's contract is a nullable string, and a non-null
          assertion would be a worse way to say that.
        */}
        {href ? (
          <a className="ws-btn" href={href} target="_blank" rel="noopener noreferrer">
            Open SQL editor
          </a>
        ) : null}
      </div>
      {/*
        SAYS THE SECOND STEP OUT LOUD. The editor opens empty, because the
        console cannot be sent a query and cannot be pointed at a row, so a
        reader who clicks the link first lands on a blank page and reasonably
        reads it as broken. The order of the two controls is the instruction,
        and this line is the instruction in words.
      */}
      {href ? (
        <p className="ndb-hint">Copy SQL first, then paste it into the editor to see this record.</p>
      ) : null}
    </section>
  );
}

/**
 * The list screens: one link for the whole table, not one per row.
 *
 * There is no per-row URL, so twenty row links would be twenty identical
 * destinations wearing different names, drawn over the top of the twenty rows a
 * recruiter is actually reading. One line under the table says the same thing
 * and costs the table nothing.
 *
 * Not a panel, because there is no record to describe: a list has only the
 * table and the database, which is one line of chips and a link.
 *
 * Renders nothing when the reader is a RECRUITER, or when currentDatabaseName()
 * cannot tell which database this deployment is talking to. The second case is
 * not an edge case to paper over: a link that opens the wrong database is worse
 * than no link, which is why neonTableUrl returns null rather than guessing, and
 * why a null is respected here instead of becoming a dead anchor.
 */
export function NeonTableLink({ role, table }: { role: AdminRole; table: NeonTable }) {
  if (!maySeeNeonConsole(role)) return null;

  const href = neonTableUrl(table);
  const database = currentDatabaseName();
  if (!href || !database) return null;

  return (
    <p className="ndb-foot">
      <span className="ndb-foot-key">Database record</span>
      <DatabaseValue database={database} production={isProductionDatabase()} />
      <code className="ndb-chip">{table}</code>
      <a className="ndb-foot-link" href={href} target="_blank" rel="noopener noreferrer">
        Open in Neon console
      </a>
    </p>
  );
}
