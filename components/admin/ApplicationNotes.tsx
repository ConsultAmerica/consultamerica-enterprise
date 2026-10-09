"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { addNoteAction } from "@/app/admin/applications/actions";

/**
 * Recruiter notes: the compose box and the list, newest first.
 *
 * A client component for the same reason as the stage control — the add has to
 * report a typed failure inline, and it has to clear the textarea only once the
 * note is actually stored. A plain form action could do neither.
 *
 * TIMESTAMPS ARRIVE PRE-FORMATTED. Calling toLocaleString() here would format
 * against the server's locale and timezone during SSR and the viewer's on
 * hydration, which React reports as a hydration mismatch and which quietly
 * shows two different times. The page formats once, on the server, and passes
 * both the display string and the machine-readable ISO value for <time>.
 */

export type ApplicationNote = {
  id: string;
  body: string;
  /** Null when the note has no author, or the author's account was deleted. */
  authorName: string | null;
  createdAtLabel: string;
  /** Empty when the stored timestamp could not be read; see the page's asDate. */
  createdAtIso: string;
};

export type ApplicationNotesProps = {
  applicationId: string;
  notes: ApplicationNote[];
};

export function ApplicationNotes({ applicationId, notes }: ApplicationNotesProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await addNoteAction(applicationId, body);
      if (!result.ok) {
        // The draft is left in the box on failure. Clearing it would lose work
        // the recruiter has no other copy of.
        setError(result.error);
        return;
      }
      setBody("");
      textareaRef.current?.focus();
      router.refresh();
    });
  };

  return (
    <>
      <form
        className="ca-crm-note-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor="new-note">Add a note</label>
        <textarea
          id="new-note"
          ref={textareaRef}
          name="body"
          rows={3}
          value={body}
          disabled={pending}
          placeholder="Screening call notes, availability, salary expectation, next step."
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="ws-actions">
          <button
            type="submit"
            className="ws-btn primary"
            // Trimmed, so a textarea holding only newlines does not look
            // submittable when the action will refuse it.
            disabled={pending || body.trim() === ""}
          >
            {pending ? "Saving..." : "Add note"}
          </button>
        </div>
      </form>

      {error ? (
        <p className="ws-row-error" role="alert">
          {error}
        </p>
      ) : null}

      {notes.length === 0 ? (
        <p className="ws-muted ca-crm-note-empty">
          No notes yet. Notes are internal, visible to Consult America staff only, and never
          shown to the candidate.
        </p>
      ) : (
        <ul className="ws-list ca-crm-notes">
          {notes.map((note) => (
            <li key={note.id}>
              <p className="ca-crm-note-meta">
                <strong>{note.authorName ?? "Unknown author"}</strong>
                {" · "}
                {/* undefined drops the attribute: a <time dateTime=""> is
                    invalid, and an unreadable timestamp is still worth showing. */}
                <time dateTime={note.createdAtIso || undefined}>{note.createdAtLabel}</time>
              </p>
              {/* React escapes the body; the pre-wrap class preserves the line
                  breaks the author typed without interpreting any markup. */}
              <p className="ca-crm-note-body">{note.body}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
