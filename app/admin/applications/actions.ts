"use server";

import { revalidatePath } from "next/cache";

import { secondRoundEligibility, SECOND_ROUND_THRESHOLD } from "@/lib/consulthire/second-round";
import { sendRejectionNotice } from "@/lib/email/application-emails";
import { sendStageEmail, stageEmailApplies } from "@/lib/email/stage-emails";
import { sendSecondRoundInvitation } from "@/lib/email/interview-emails";
import {
  ApplicationNotFoundError,
  assignRecruiter,
  deleteApplication,
  getApplicationDetail,
  setApplicationStatus,
} from "@/lib/neon/applications";
import { requireAdmin, type AdminSessionUser } from "@/lib/neon/auth";
import { FOREIGN_KEY_VIOLATION, NeonConfigError, isPgError, isUuid } from "@/lib/neon/client";
import { logActivity } from "@/lib/neon/crm";
import { deleteResume } from "@/lib/neon/resume-storage";
import { claimSecondRoundSend, getAiInterview, releaseSecondRoundSend } from "@/lib/neon/interviews";
import { isApplicationStatus, type ApplicationStatus } from "@/lib/neon/types";

/**
 * The two writes the recruiter CRM screens perform: move an application
 * through the hiring pipeline, and change who owns it.
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
 * RECRUITER_ASSIGNED. Duplicating either of them here would double every entry
 * in the audit trail, which is the one view that has to stay trustworthy.
 */

/**
 * `message` carries a success that is worth saying something about, which so
 * far means one thing: the stage change committed but the candidate could not
 * be emailed. That is not a failure of the action the recruiter took, and
 * reporting it as one would send them to retry a write that already happened,
 * so it rides on the success instead.
 */
export type CrmActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const GENERIC = "Something went wrong. Please try again.";
const MISSING = "That application no longer exists. Reload the page.";
const BAD_REQUEST = "That request was not understood. Reload the page and try again.";
const NOT_CONFIGURED =
  "The recruitment database is not configured on this deployment (DATABASE_URL is unset), " +
  "so nothing can be saved. Ask an administrator to set it.";

/** The list page renders at most 100 rows, so a larger bulk did not come from it. */
const BULK_MAX = 100;

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
  /*
    A foreign key violation here means the application was deleted in another
    tab between this screen rendering and the write landing: the insert is what
    discovers the row is gone. Reported as not-found, which is what it is.
  */
  if (isPgError(error, FOREIGN_KEY_VIOLATION)) {
    return { ok: false, error: MISSING };
  }
  console.error(`[admin-crm] ${scope} failed`, error);
  return { ok: false, error: GENERIC };
}

/**
 * Tell the candidate their application moved, and record whether it landed.
 *
 * ONE PATH FOR EVERY STAGE. Rejection used to be the only stage that wrote to
 * a candidate, with its own branch. Every stage that has something to say now
 * goes through here, so there is one place that decides whether a message is
 * owed, one place that sends it and one place that records the outcome. Seven
 * branches would be seven chances for the next stage to be forgotten.
 *
 * WHICH STAGES WRITE. Screening, Interview, Shortlisted, Offer, Hired and
 * Rejected. NEW does not, because the application confirmation said exactly
 * that minutes earlier, and WITHDRAWN does not, because it is the candidate's
 * own decision and does not need announcing back to them.
 *
 * WHY THE PREVIOUS STAGE IS THE GUARD. A candidate must hear each move once. A
 * recruiter re-saving the stage an application is already in, or sweeping a
 * filtered list that already contains rows at that stage, must not send a
 * second copy. setApplicationStatus is already a no-op in that case, so the
 * stage is read before the write and nothing is sent when it has not changed.
 *
 * This is a guard, not a lock. Two recruiters moving the same application in
 * the same second could both read the old stage and both send. A stamped
 * column the way claimSecondRoundSend does it would close that window and
 * needs a migration, which is held until the ones already written reach
 * production. The exposure is one duplicate email in a genuine race.
 *
 * NEVER THROWS AND NEVER BLOCKS. The stage change is committed before this
 * runs, so a mail outage is not a reason to report the move as failed.
 */
async function emailStageChange(
  applicationId: string,
  status: ApplicationStatus,
  actorId: string | null,
  changed: boolean,
): Promise<"sent" | "skipped" | "failed"> {
  if (!changed) return "skipped";
  if (status !== "REJECTED" && !stageEmailApplies(status)) return "skipped";

  try {
    const detail = await getApplicationDetail(applicationId);
    if (!detail) return "failed";

    const candidateName =
      `${detail.candidate.first_name} ${detail.candidate.last_name}`.trim() ||
      detail.candidate.email;

    /*
      Rejection keeps its own renderer. It is the one message whose wording was
      settled separately and it must not drift toward the encouraging tone the
      other stages carry.
    */
    const outcome =
      status === "REJECTED"
        ? (await sendRejectionNotice({
            candidateName,
            candidateEmail: detail.candidate.email,
            jobTitle: detail.job.title,
            applicationId,
            applicationNumber: detail.application.reference,
          }))
          ? "sent"
          : "failed"
        : await sendStageEmail(status, {
            candidateName,
            candidateEmail: detail.candidate.email,
            jobTitle: detail.job.title,
          });

    /*
      RECORDED ON THE TIMELINE, which is where a recruiter already looks to see
      what happened to an application. EMAIL_SENT is in the activity CHECK list
      already, so this needs no migration, and the detail line names the stage
      and says plainly whether it was delivered. A failure that is only in a
      server log is a failure nobody acts on: the person still has not been
      told, and the recruiter has no way to know.
    */
    await logActivity(
      applicationId,
      actorId,
      "EMAIL_SENT",
      outcome === "sent"
        ? `${humanStage(status)} notification sent to the candidate`
        : `${humanStage(status)} notification could not be sent. Contact the candidate directly.`,
    ).catch((error) => {
      // The email is the thing that mattered and it already happened. A failed
      // timeline write must not turn a delivered message into a reported error.
      console.error("[admin-crm] could not record EMAIL_SENT", applicationId, error);
    });

    return outcome;
  } catch (error) {
    console.error("[admin-crm] stage email failed", applicationId, status, error);
    return "failed";
  }
}

/** ALL_CAPS stage to something that reads in a sentence on the timeline. */
function humanStage(status: ApplicationStatus): string {
  const lower = status.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** The stage an application is in right now, or null when it is gone. */
async function currentStage(applicationId: string): Promise<string | null> {
  try {
    const detail = await getApplicationDetail(applicationId);
    return detail?.application.status ?? null;
  } catch {
    return null;
  }
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
    /*
      Read before the write. Afterwards there is no way to tell a real move from
      a re-save of the stage the application was already in, and the difference
      decides whether the candidate hears about it. See emailStageChange.
    */
    const changed = (await currentStage(applicationId)) !== status;

    const application = await setApplicationStatus(applicationId, status, auth.actor.id);
    revalidateApplication(applicationId, application.candidate_id);

    const outcome = await emailStageChange(applicationId, status, auth.actor.id, changed);
    if (outcome === "failed") {
      /*
        Reported as a success with a warning, not a failure. The stage change is
        committed and correct; what did not happen is the email. A recruiter
        told the whole action failed will click it again and move an
        already-moved application a second time.
      */
      return {
        ok: true,
        message: `Moved to ${humanStage(status)}. The candidate could not be emailed just now, so contact them directly.`,
      };
    }

    return { ok: true };
  } catch (error) {
    return toFailure("setStageAction", error);
  }
}

/**
 * Move several applications to the same stage in one go.
 *
 * PER-APPLICATION, NOT ONE BULK UPDATE STATEMENT. A single UPDATE ... WHERE id
 * = ANY($1) would be one round trip, and it would be wrong: setApplicationStatus
 * writes a STATUS_CHANGED activity row and enqueues a Zoho sync job inside its
 * own transaction, and a bulk UPDATE skips both. The audit trail is the one
 * view that has to stay trustworthy, so twelve stage changes must leave twelve
 * entries whether they were made one at a time or together.
 *
 * SEQUENTIAL, NOT Promise.all. The Neon HTTP driver opens a connection per
 * statement; firing fifty transactions at once is how a serverless function
 * exhausts the pool and turns a bulk action into a partial one for reasons
 * nobody can reconstruct afterwards. Fifty sequential writes is a slow click,
 * not a broken feature.
 *
 * PARTIAL SUCCESS IS REPORTED, NOT HIDDEN. If three of ten fail because
 * somebody deleted them in another tab, the caller is told exactly that. A
 * bulk action that silently half-applies is worse than one that refuses.
 */
export async function setStageBulkAction(
  applicationIds: string[],
  status: string,
): Promise<CrmActionResult & { moved?: number; failed?: number }> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
    return { ok: false, error: BAD_REQUEST };
  }
  if (!isApplicationStatus(status)) {
    return { ok: false, error: BAD_REQUEST };
  }
  // De-duplicated and capped. The page shows at most 100 rows, so anything
  // larger did not come from the UI and there is no reason to serve it.
  const ids = Array.from(new Set(applicationIds));
  if (ids.length > BULK_MAX || ids.some((id) => !isUuid(id))) {
    return { ok: false, error: BAD_REQUEST };
  }

  let moved = 0;
  let failed = 0;
  const touchedCandidates = new Set<string>();

  /*
    EVERY CANDIDATE WHOSE STAGE ACTUALLY CHANGES IS EMAILED, including from
    here. A bulk move of twelve to Shortlisted sends twelve notifications,
    which is what a bulk move means. Rows already at that stage are skipped by
    the same guard the single move uses, so sweeping a filtered list does not
    mail the people in it twice.

    Counted separately from `failed`. A stage change that committed while its
    email bounced is not a failed move, and rolling the count together would
    tell a recruiter to retry writes that already succeeded.
  */
  let unmailed = 0;

  for (const id of ids) {
    try {
      const changed = (await currentStage(id)) !== status;

      const application = await setApplicationStatus(id, status, auth.actor.id);
      moved += 1;
      if (application.candidate_id) touchedCandidates.add(application.candidate_id);

      if ((await emailStageChange(id, status, auth.actor.id, changed)) === "failed") {
        unmailed += 1;
      }
    } catch (error) {
      // One failure must not abandon the rest: the recruiter asked for ten
      // moves and nine of them are still correct and still wanted.
      failed += 1;
      console.error("[admin-crm] setStageBulkAction failed for one application", error);
    }
  }

  revalidatePath("/admin/applications");
  revalidatePath("/admin/dashboard");
  for (const candidateId of touchedCandidates) {
    revalidatePath(`/admin/candidates/${candidateId}`);
  }

  if (moved === 0) {
    return { ok: false, error: "None of those applications could be moved. Reload the page." };
  }
  if (unmailed > 0) {
    // Named so the recruiter knows how many people still need telling, rather
    // than being left to assume every rejection was delivered.
    return {
      ok: true,
      moved,
      failed,
      message: `Moved ${moved}. ${unmailed} candidate${unmailed === 1 ? "" : "s"} could not be emailed, so contact ${unmailed === 1 ? "them" : "those"} directly.`,
    };
  }
  return { ok: true, moved, failed };
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
 * Invite a candidate to a second round, once.
 *
 * THE DOUBLE-SEND GUARD IS THE WHOLE POINT OF THIS FUNCTION'S SHAPE, and it is
 * not the button's `disabled` attribute. A server action is a public HTTP
 * endpoint, two recruiters can be looking at the same candidate, and one person
 * can double-click. So the order is:
 *
 *   1. re-check eligibility against the row, not against what the page showed;
 *   2. CLAIM the send with a conditional UPDATE, which exactly one caller wins;
 *   3. only then send the email;
 *   4. give the claim back if the email did not go.
 *
 * Claiming before sending rather than after is deliberate. Sending first means
 * a crash between the two leaves an invitation in the candidate's inbox with no
 * record of it, and the next click sends a second. Claiming first risks the
 * opposite, a stamp with no email, which step 4 undoes and which a human can
 * recover from anyway. One of those failures spams a candidate and the other
 * does not.
 */
export async function sendSecondRoundAction(
  applicationId: string,
): Promise<CrmActionResult & { message?: string }> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  if (!isUuid(applicationId)) {
    return { ok: false, error: BAD_REQUEST };
  }

  try {
    const detail = await getApplicationDetail(applicationId);
    if (!detail) return { ok: false, error: MISSING };

    const interview = await getAiInterview(applicationId);
    // Asked of the row, so a page rendered before somebody else sent the
    // invitation cannot talk this into sending a second one.
    const eligibility = secondRoundEligibility(interview);

    if (!eligibility.eligible) {
      switch (eligibility.reason) {
        case "no-interview":
          return {
            ok: false,
            error: "This application has no AI interview, so there is no result to act on.",
          };
        case "not-scored":
          return {
            ok: false,
            error:
              "This interview has no score yet. The invitation becomes available once the " +
              "candidate finishes and the result arrives.",
          };
        case "below-threshold":
          return {
            ok: false,
            error:
              `This candidate scored ${eligibility.score}, below the ${SECOND_ROUND_THRESHOLD} ` +
              "needed for an automatic second-round invitation. Contact them directly if you " +
              "want to take them further.",
          };
        case "already-sent":
          return {
            ok: false,
            error: "A second-round invitation has already been sent for this application.",
          };
      }
    }

    // interview is non-null whenever eligibility.eligible is true, but the
    // compiler cannot see that through the helper's return type.
    if (!interview) return { ok: false, error: MISSING };

    const claimed = await claimSecondRoundSend(interview.id);
    if (!claimed?.second_round_sent_at) {
      // Lost the race to another request, which is a success for the candidate
      // and must not read as an error for this recruiter.
      return {
        ok: false,
        error: "A second-round invitation has already been sent for this application.",
      };
    }

    const candidateName =
      `${detail.candidate.first_name} ${detail.candidate.last_name}`.trim() ||
      detail.candidate.email;

    const { sent } = await sendSecondRoundInvitation({
      candidateName,
      candidateEmail: detail.candidate.email,
      jobTitle: detail.job.title,
      applicationNumber: detail.application.reference,
      recruiterName: auth.actor.fullName,
    });

    if (!sent) {
      // Hand the claim back so the recruiter can retry once mail is working.
      // The message depends on whether that actually worked: telling somebody
      // "nothing was recorded, try again" while the stamp is still standing
      // sends them to a button that is no longer there, which is exactly the
      // confusion this branch produced before releaseSecondRoundSend reported
      // its result.
      const released = await releaseSecondRoundSend(
        interview.id,
        claimed.second_round_sent_at,
      );
      return {
        ok: false,
        error: released
          ? "The invitation could not be sent just now, so nothing was recorded. Please try " +
            "again in a moment."
          : "The invitation could not be sent, and this application is now marked as invited so " +
            "it cannot be retried from here. Email the candidate directly.",
      };
    }

    /*
      EMAIL_SENT on the timeline, after the send and not before it.

      The audit trail is the one view that has to stay trustworthy, so it
      records what happened rather than what was attempted: a failed send has
      already returned above and written no entry. A separate write from the
      claim, deliberately, because the claim has to be atomic and alone to do
      its job and the timeline entry must not be able to make it fail.
    */
    await logActivity(
      applicationId,
      auth.actor.id,
      "EMAIL_SENT",
      `Second-round invitation sent to ${detail.candidate.email} (AI interview score ${eligibility.score}/10).`,
    );

    revalidateApplication(applicationId, detail.application.candidate_id);
    return { ok: true, message: `Second-round invitation sent to ${detail.candidate.email}.` };
  } catch (error) {
    return toFailure("sendSecondRoundAction", error);
  }
}

/**
 * Delete applications outright.
 *
 * IRREVERSIBLE, AND IT TAKES MORE THAN THE ROW. Each application's timeline
 * and any AI interview attached to it cascade away with it (see
 * deleteApplication), and this also deletes the candidate's résumé from Vercel
 * Blob, because a file nothing points at is a candidate's personal document
 * left in a bucket forever. The candidate record itself is kept: a person can
 * hold several applications and removing one says nothing about them.
 *
 * SEQUENTIAL, AND PARTIAL SUCCESS IS REPORTED, for the same reasons as
 * setStageBulkAction above: the Neon HTTP driver opens a connection per
 * statement, and a recruiter who asked for ten deletions and got seven needs to
 * be told which number is real.
 *
 * A FAILED BLOB DELETE IS NOT A FAILED DELETION. The row is already gone by
 * then, and reporting the whole thing as failed would send somebody to retry a
 * deletion that already happened. It is logged and counted separately.
 */
export async function deleteApplicationsAction(
  applicationIds: string[],
): Promise<CrmActionResult & { deleted?: number; failed?: number }> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
    return { ok: false, error: BAD_REQUEST };
  }
  const ids = Array.from(new Set(applicationIds));
  if (ids.length > BULK_MAX || ids.some((id) => !isUuid(id))) {
    return { ok: false, error: BAD_REQUEST };
  }

  let deleted = 0;
  let failed = 0;
  let orphanedBlobs = 0;
  const touchedCandidates = new Set<string>();

  for (const id of ids) {
    try {
      const removed = await deleteApplication(id);
      if (!removed) {
        // Already gone, most likely deleted in another tab. Not an error worth
        // reporting on its own, but not a deletion this click performed either.
        failed += 1;
        continue;
      }
      deleted += 1;
      touchedCandidates.add(removed.candidateId);

      if (removed.resumeUrl) {
        try {
          await deleteResume(removed.resumeUrl);
        } catch (error) {
          orphanedBlobs += 1;
          console.error("[admin-crm] resume blob not deleted", removed.reference, error);
        }
      }
    } catch (error) {
      failed += 1;
      console.error("[admin-crm] deleteApplicationsAction failed for one application", error);
    }
  }

  revalidatePath("/admin/applications");
  revalidatePath("/admin/dashboard");
  for (const candidateId of touchedCandidates) {
    revalidatePath(`/admin/candidates/${candidateId}`);
  }

  if (deleted === 0) {
    return { ok: false, error: "None of those applications could be deleted. Reload the page." };
  }
  if (orphanedBlobs > 0) {
    return {
      ok: true,
      deleted,
      failed,
      message: `Deleted ${deleted}. ${orphanedBlobs} résumé file${orphanedBlobs === 1 ? "" : "s"} could not be removed from storage and will need clearing by hand.`,
    };
  }
  return { ok: true, deleted, failed };
}
