"use server";

import { revalidatePath } from "next/cache";

import {
  ApplicationNotFoundError,
  assignRecruiter,
  setApplicationStatus,
} from "@/lib/neon/applications";
import { requireAdmin, type AdminSessionUser } from "@/lib/neon/auth";
import { FOREIGN_KEY_VIOLATION, NeonConfigError, isPgError, isUuid } from "@/lib/neon/client";
import { NoteInputError, addNote } from "@/lib/neon/crm";
import { isApplicationStatus } from "@/lib/neon/types";

/**
 * The three writes the recruiter CRM screens perform: move an application
 * through the hiring pipeline, change who owns it, and add a note.
 *
 * Two rules shape this file.
 *
 * 1. A server action is a public HTTP endpoint. The page that rendered the form
 *    proves nothing about who is calling the action afterwards, so every entry
 *    point re-checks authorization itself and re-validates its arguments
 *    against the schema's CHECK lists before a statement is built.
 *
 * 2. Nothing here throws for a foreseeable failure. Next redacts thrown Server
 *    Action messages in production, and Postgres detail must never reach a
 *    browser, so refusals come back as `{ ok: false, error }` for the client
 *    component to render inline and the real cause is logged server-side under
 *    [admin-crm]. The one deliberate exception is the redirect requireAdmin()
 *    performs for a signed-out caller: that is Next's control flow, not an
 *    error, and swallowing it would turn "your session expired" into a generic
 *    failure with no way forward. See `authorize` below.
 *
 * What this file does NOT do: write activity rows or enqueue CRM syncs.
 * setApplicationStatus already writes STATUS_CHANGED and enqueues an
 * UPDATE_STATUS job inside its own transaction, assignRecruiter writes
 * RECRUITER_ASSIGNED, and addNote writes NOTE_ADDED. Duplicating any of them
 * here would double every entry in the audit trail, which is the one view that
 * has to stay trustworthy.
 */

export type CrmActionResult = { ok: true } | { ok: false; error: string };

const GENERIC = "Something went wrong. Please try again.";
const MISSING = "That application no longer exists. Reload the page.";
const BAD_REQUEST = "That request was not understood. Reload the page and try again.";
const EMPTY_NOTE = "A note needs some text.";
const NOT_CONFIGURED =
  "The recruitment database is not configured on this deployment (DATABASE_URL is unset), " +
  "so nothing can be saved. Ask an administrator to set it.";

/** Long enough for a real handover note, short enough that a paste bomb is capped. */
const NOTE_MAX_LENGTH = 10_000;

type Authorized = { ok: true; actor: AdminSessionUser } | { ok: false; error: string };

/**
 * requireAdmin(), with only the "database not configured" case converted to a
 * result.
 *
 * The narrow catch matters: requireAdmin signals "not signed in" by calling
 * redirect(), which throws a control-flow error Next has to receive. Catching
 * NeonConfigError by its type and re-throwing everything else keeps that
 * redirect working while still giving an unconfigured deployment a readable
 * message instead of a 500.
 */
async function authorize(): Promise<Authorized> {
  try {
    return { ok: true, actor: await requireAdmin() };
  } catch (error) {
    if (error instanceof NeonConfigError) {
      return { ok: false, error: NOT_CONFIGURED };
    }
    throw error;
  }
}

/**
 * Every screen that can be showing the row we just changed: the queue, the
 * application itself, and the candidate profile that lists the stage of every
 * application the person holds.
 *
 * `candidateId` is passed rather than looked up, because the write functions
 * return the row they just changed and it is already in hand.
 */
function revalidateApplication(applicationId: string, candidateId?: string | null): void {
  revalidatePath("/admin/applications");
  revalidatePath(`/admin/applications/${applicationId}`);
  if (candidateId) {
    revalidatePath(`/admin/candidates/${candidateId}`);
  }
}

/** Shared tail of every write: map a known cause, log and hide the rest. */
function toFailure(scope: string, error: unknown): CrmActionResult {
  if (error instanceof ApplicationNotFoundError) {
    return { ok: false, error: MISSING };
  }
  if (error instanceof NeonConfigError) {
    return { ok: false, error: NOT_CONFIGURED };
  }
  if (error instanceof NoteInputError) {
    return { ok: false, error: EMPTY_NOTE };
  }
  // application_notes.application_id is a foreign key, so a note written against
  // an application that was deleted in another tab lands here rather than as a
  // not-found: the insert is what discovers the row is gone.
  if (isPgError(error, FOREIGN_KEY_VIOLATION)) {
    return { ok: false, error: MISSING };
  }
  console.error(`[admin-crm] ${scope} failed`, error);
  return { ok: false, error: GENERIC };
}

/**
 * Move an application to another hiring stage.
 *
 * `status` is typed as a plain string on purpose: the value arrives over HTTP
 * and a TypeScript union is not a runtime guarantee. isApplicationStatus is the
 * same list as the CHECK constraint, so an unknown value is a refusal here
 * rather than a check_violation 500 from Postgres.
 *
 * Moving to the stage the application is already in is accepted and writes
 * nothing — setApplicationStatus treats it as a no-op so the timeline does not
 * fill with "INTERVIEW to INTERVIEW".
 */
export async function setStageAction(
  applicationId: string,
  status: string,
): Promise<CrmActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  if (!isUuid(applicationId) || !isApplicationStatus(status)) {
    return { ok: false, error: BAD_REQUEST };
  }

  try {
    const application = await setApplicationStatus(applicationId, status, auth.actor.id);
    revalidateApplication(applicationId, application.candidate_id);
    return { ok: true };
  } catch (error) {
    return toFailure("setStageAction", error);
  }
}

/**
 * Assign the owning recruiter, or unassign with null.
 *
 * Unassigning is a real action rather than a blank value: assignRecruiter gives
 * it its own RECRUITER_ASSIGNED timeline entry, so "nobody owns this any more"
 * is visible in the audit trail.
 */
export async function assignRecruiterAction(
  applicationId: string,
  adminUserId: string | null,
): Promise<CrmActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  // null means unassign; anything else has to be a well-formed id, because the
  // column is a uuid and a malformed string would raise
  // invalid_text_representation inside the transaction.
  if (!isUuid(applicationId) || (adminUserId !== null && !isUuid(adminUserId))) {
    return { ok: false, error: BAD_REQUEST };
  }

  try {
    const application = await assignRecruiter(applicationId, adminUserId, auth.actor.id);
    revalidateApplication(applicationId, application.candidate_id);
    return { ok: true };
  } catch (error) {
    // assigned_recruiter_id references admin_users, so an id that no longer
    // exists is a foreign key violation, not a missing application.
    if (isPgError(error, FOREIGN_KEY_VIOLATION)) {
      return { ok: false, error: "That recruiter account no longer exists. Reload the page." };
    }
    return toFailure("assignRecruiterAction", error);
  }
}

/**
 * Add a note to an application.
 *
 * The body is capped and trimmed here as well as in addNote: the cap is about
 * what a browser can post, and trimming before the length test means a note of
 * nothing but whitespace is refused with a sentence the recruiter can act on
 * rather than being stored as an empty line in the timeline.
 */
export async function addNoteAction(
  applicationId: string,
  body: string,
): Promise<CrmActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  if (!isUuid(applicationId)) {
    return { ok: false, error: BAD_REQUEST };
  }

  const trimmed = (typeof body === "string" ? body : "").trim().slice(0, NOTE_MAX_LENGTH);
  if (trimmed === "") {
    return { ok: false, error: EMPTY_NOTE };
  }

  try {
    await addNote(applicationId, auth.actor.id, trimmed);
    // No candidate id to hand here — addNote returns the note, not the
    // application — and the candidate profile does not render notes, so the two
    // application paths are the whole blast radius.
    revalidateApplication(applicationId);
    return { ok: true };
  } catch (error) {
    return toFailure("addNoteAction", error);
  }
}
