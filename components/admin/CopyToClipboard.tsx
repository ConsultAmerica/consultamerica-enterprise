"use client";

import { useState } from "react";

import { recordSql, type NeonTable } from "@/lib/neon/console-link";

/**
 * The copy controls for the Database record panel: one for the record id, one
 * for the statement that finds it.
 *
 * WHY COPYING MATTERS HERE. Neon's console cannot be addressed down to a single
 * row, so arriving at the record means running a query once you are inside it.
 * Copying is therefore the part of the panel that does the work, and it is why
 * both controls are ordinary buttons of the same weight as the console link
 * rather than something smaller tucked beside it.
 *
 * WHY THIS IS THE ONLY CLIENT CODE IN THE FEATURE. The clipboard is a browser
 * API. Everything else the panel shows is rendered on the server.
 *
 * THE VALUES REMAIN OBTAINABLE WITHOUT THESE BUTTONS. The record id is rendered
 * beside them with `user-select: all`, so one click selects it whole. That
 * fallback is not decoration: navigator.clipboard does not exist outside a
 * secure context, so a developer reaching this dashboard over plain http on a
 * LAN address has no working button and still has to be able to get the id.
 */

type CopyState = "idle" | "copied" | "failed";

type Props = {
  /** Written to the clipboard verbatim. Never rendered by this component. */
  value: string;
  /** Resting button text. Short, and specific enough to tell two of these
   *  buttons apart in one row ("Copy ID", "Copy SQL"). */
  label: string;
  /**
   * What the value is, for the screen-reader announcement ("record id", "SQL
   * statement"). Lower case: it is read inside a sentence.
   */
  describe: string;
  /** Render at the smaller size used inline beside a value. */
  small?: boolean;
};

export function CopyToClipboard({ value, label, describe, small = false }: Props) {
  const [state, setState] = useState<CopyState>("idle");

  async function copy() {
    try {
      // Checked rather than called blind. Outside a secure context
      // navigator.clipboard is undefined, and `undefined.writeText` would be an
      // unhandled TypeError in the console instead of a message on the screen.
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setState("copied");
      // Back to resting, so the control does not keep claiming a copy that
      // happened a quarter of an hour ago. A failure deliberately does NOT
      // reset: it carries an instruction the reader has to be able to finish
      // reading.
      window.setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      <button
        type="button"
        // .ws-btn is the dashboard's own button, so these sit in the panel as
        // the same object as every other control on the page. State lives on a
        // data attribute rather than a class, the convention .ca-crm-rail
        // already uses, so it stays legible to anyone reading the DOM.
        className={small ? "ws-btn ndb-copy ndb-btn-sm" : "ws-btn ndb-copy"}
        data-state={state}
        onClick={copy}
      >
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
      </button>
      {/*
        The visible label change above is for sighted readers; this is the same
        news for everyone else. Rendered from the first paint (empty) so the live
        region already exists when its content changes, which is what makes an
        assistive technology announce it.
      */}
      <span className="sr-only" role="status">
        {state === "copied"
          ? `The ${describe} is on your clipboard.`
          : state === "failed"
            ? `Could not reach the clipboard. Select the ${describe} in the panel and copy it by hand.`
            : ""}
      </span>
    </>
  );
}

/**
 * Copy SQL.
 *
 * WHY THE STATEMENT IS BUILT HERE AND NOT HANDED DOWN AS A PROP. The panel does
 * not display the statement, and a prop on a client component is serialized
 * into the RSC payload that ships inside the page's HTML, so passing it from
 * the server would have put the text in the document anyway and made "the panel
 * does not show the query" true only of the part a person can see. Deriving it
 * in the browser from the table and the id, both of which the panel already
 * shows, keeps the rendered document free of it.
 *
 * This is a presentation choice and not a secret being protected: the statement
 * is a table name and a uuid, and both are on screen directly above the button.
 *
 * It still comes from the shared `recordSql`, so the dashboard cannot drift from
 * the statement the rest of the system would tell somebody to run, and the
 * validation in that helper applies here too: a table off the allowlist or an id
 * that is not a uuid yields no statement, and no button rather than a button
 * that copies nothing.
 */
export function CopyRecordSql({ table, id }: { table: NeonTable; id: string }) {
  const sql = recordSql(table, id);
  if (!sql) return null;
  return <CopyToClipboard value={sql} label="Copy SQL" describe="SQL statement" />;
}
