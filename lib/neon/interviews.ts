/**
 * Interview writes: the completion webhook's landing site, and the second-round
 * stamp.
 *
 * Both functions in here exist because of the same property: they are called
 * from endpoints that can be hit more than once for the same event, and the
 * second hit must change nothing. A webhook is retried after a timeout; a
 * recruiter double-clicks a button, or two recruiters click it on the same
 * candidate. So neither function is "update the row" — each one is "update the
 * row if it still needs updating, and say which happened".
 *
 * The idempotency is enforced by the database, not by reading first and writing
 * second in application code. A read-then-write is a race under READ COMMITTED:
 * two deliveries both see completed_at IS NULL, both write, and the candidate's
 * recruiter gets two "interview complete" emails. The reads here take FOR
 * UPDATE, or the write itself carries the condition in its WHERE clause.
 */

import { db, isUuid, tx, type Queryable } from "./client";
import { insertActivity } from "./crm";
import type { InterviewRow } from "./types";

const INTERVIEW_COLUMNS = `
  id, application_id, kind, status, scheduled_at, completed_at,
  consulthire_interview_id, score, summary, created_at, updated_at,
  report, verdict, transcript_url, second_round_sent_at, launched_at
`;

// ------------------------------------------------------------------- reads

/** The AI interview for one application, or null when there is none. */
export async function getAiInterview(
  applicationId: string,
  runner: Queryable = db,
): Promise<InterviewRow | null> {
  if (!isUuid(applicationId)) return null;
  const rows = await runner.query<InterviewRow>(
    `SELECT ${INTERVIEW_COLUMNS}
       FROM interviews
      WHERE application_id = $1 AND kind = 'AI_SCREEN'`,
    [applicationId],
  );
  return rows[0] ?? null;
}

// ------------------------------------------------------- completion webhook

export interface InterviewCompletionInput {
  /** ConsultHire's session id. Becomes interviews.consulthire_interview_id. */
  sessionId: string;
  /** applications.id, as ConsultHire echoes it back from the launch token. */
  applicationId: string;
  /** 0 to 10, or null when the session was too thin to score. */
  score: number | null;
  verdict: string | null;
  /** The structured report, already parsed. Stored as jsonb. */
  report: unknown;
  /** One-line headline, for the summary column the Interviews panel renders. */
  summary: string | null;
  completedAt: Date;
  transcriptUrl: string | null;
}

export type InterviewCompletionResult =
  /** The result was written. The only case that should send an email. */
  | { outcome: "recorded"; interview: InterviewRow }
  /** Already recorded. A retry or a duplicate delivery; nothing changed. */
  | { outcome: "duplicate"; interview: InterviewRow }
  /** No row to land on. The application was deleted, or never ours. */
  | { outcome: "not-found" }
  /**
   * The application already holds a DIFFERENT completed ConsultHire session.
   * Refused rather than overwritten; see the comment on the check below.
   */
  | { outcome: "conflict"; interview: InterviewRow };

/**
 * Record a finished AI interview.
 *
 * LOOKUP ORDER: the session id first, the application second.
 *
 * The session id is the stronger key — it is what
 * interviews_consulthire_id_uidx is unique on, and matching it means this
 * exact delivery has been seen before and the row is unambiguous. The
 * application id is the fallback for the first delivery, when the row exists
 * (the apply route created it) but has never carried a session id. Doing it the
 * other way round would work until an application somehow had two sessions,
 * and then it would silently pick whichever row the index happened to return.
 */
export async function recordInterviewCompletion(
  input: InterviewCompletionInput,
): Promise<InterviewCompletionResult> {
  if (!isUuid(input.applicationId)) return { outcome: "not-found" };

  return tx(async (t) => {
    // FOR UPDATE, so a retry arriving while the first delivery is still in
    // flight waits here rather than racing it. Without the lock both could
    // read completed_at IS NULL and both would count as the first.
    const [existing] = await t.query<InterviewRow>(
      `SELECT ${INTERVIEW_COLUMNS}
         FROM interviews
        WHERE consulthire_interview_id = $1
           OR (application_id = $2 AND kind = 'AI_SCREEN')
        ORDER BY (consulthire_interview_id = $1) DESC
        LIMIT 1
        FOR UPDATE`,
      [input.sessionId, input.applicationId],
    );

    if (!existing) return { outcome: "not-found" };

    /*
      A COMPLETED RESULT IS NEVER OVERWRITTEN BY A DIFFERENT SESSION.

      ConsultHire upserts its Candidate on externalAppId, so one application
      has one session and this cannot happen through the supported flow. It can
      happen if a session is created by hand at the far end, or if a future
      change there drops that uniqueness. The failure mode if we just wrote
      would be the worst kind: one candidate's score silently replaced by
      another's on a live hiring record, with the old value gone. Refusing and
      logging keeps both results recoverable.
    */
    if (
      existing.completed_at &&
      existing.consulthire_interview_id &&
      existing.consulthire_interview_id !== input.sessionId
    ) {
      return { outcome: "conflict", interview: existing };
    }

    // The same session, already recorded. A retry, or ConsultHire re-sending
    // after a response it never saw. Nothing to do and nothing to announce.
    if (existing.completed_at && existing.consulthire_interview_id === input.sessionId) {
      return { outcome: "duplicate", interview: existing };
    }

    const rows = await t.query<InterviewRow>(
      `UPDATE interviews
          SET consulthire_interview_id = $2,
              -- NUMERIC(5,2): the driver takes a JS number and Postgres
              -- rounds it to the column's scale.
              score                = $3,
              verdict              = $4,
              report               = $5::jsonb,
              summary              = COALESCE($6, summary),
              transcript_url       = COALESCE($7, transcript_url),
              status               = 'COMPLETED',
              completed_at         = $8
        WHERE id = $1
        RETURNING ${INTERVIEW_COLUMNS}`,
      [
        existing.id,
        input.sessionId,
        input.score,
        input.verdict,
        // Re-stringified for the ::jsonb cast. The driver would send a JS
        // object as a Postgres record literal, which jsonb rejects.
        input.report === null || input.report === undefined
          ? null
          : JSON.stringify(input.report),
        input.summary,
        input.transcriptUrl,
        input.completedAt,
      ],
    );

    const interview = rows[0];
    if (!interview) {
      // The row was locked FOR UPDATE a few statements ago, so it cannot have
      // gone. A throw rolls the transaction back and the webhook answers 500,
      // which is correct: ConsultHire should retry something this strange.
      throw new Error("Update of interviews returned no row.");
    }

    await insertActivity(t, {
      applicationId: interview.application_id,
      // No admin did this. The audit trail's "Candidate or system" is right.
      actorId: null,
      kind: "INTERVIEW_COMPLETED",
      detail:
        input.score === null
          ? "AI interview finished without a score."
          : `AI interview scored ${input.score}/10${input.verdict ? ` (${input.verdict})` : ""}.`,
    });

    return { outcome: "recorded", interview };
  });
}

// ------------------------------------------------------------ second round

/**
 * Stamp the second-round invitation, but only if it has not been stamped.
 *
 * THE CONDITION IS IN THE WHERE CLAUSE, NOT IN A PRIOR READ. This is the only
 * thing standing between a double-click and two invitations in a candidate's
 * inbox, and "SELECT, check, UPDATE" does not provide it: both requests read
 * null, both update, both send. `WHERE second_round_sent_at IS NULL` makes the
 * check and the claim one atomic statement, so exactly one caller gets a row
 * back and only that caller sends the email.
 *
 * Called BEFORE the email, for the same reason. Sending first and stamping
 * after would mean a crash between the two leaves a sent invitation with no
 * record of it, and the next click sends a second one. Stamping first risks the
 * opposite — a stamp with no email — which is recoverable by a human and does
 * not spam the candidate.
 */
export async function claimSecondRoundSend(
  interviewId: string,
  runner: Queryable = db,
): Promise<InterviewRow | null> {
  if (!isUuid(interviewId)) return null;
  const rows = await runner.query<InterviewRow>(
    /*
      date_trunc TO MILLISECONDS, AND IT IS NOT COSMETIC.

      Postgres timestamptz keeps microseconds; a JavaScript Date keeps
      milliseconds. A bare NOW() therefore stores 16:22:36.814372, the driver
      hands it back as 16:22:36.814, and releaseSecondRoundSend below compares
      that value against the stored one and matches NOTHING. The symptom found
      in testing was precisely that: a Resend failure reported "nothing was
      recorded" to the recruiter while the stamp stayed in the database, so the
      invitation could never be retried from the dashboard. Truncating at write
      time makes the round trip lossless, so the claim and its release are
      talking about the same instant.

      Nothing is lost by it: the value is only ever rendered to the minute.
    */
    `UPDATE interviews
        SET second_round_sent_at = date_trunc('milliseconds', NOW())
      WHERE id = $1 AND second_round_sent_at IS NULL
      RETURNING ${INTERVIEW_COLUMNS}`,
    [interviewId],
  );
  return rows[0] ?? null;
}

/**
 * Give the stamp back when the email could not be sent.
 *
 * Without this, a Resend outage would permanently convince the dashboard that
 * an invitation had gone out, and the recruiter would have no way to retry from
 * the UI. Narrowed to the exact instant this request claimed, so it can never
 * clear a stamp that belongs to a genuine earlier send.
 *
 * That narrowing only works because claimSecondRoundSend truncates the stored
 * value to milliseconds; see the comment there for the bug this pair had when
 * it did not. The boolean return says whether the release actually matched, so
 * a caller is never told a retry is possible when the stamp is still standing.
 */
export async function releaseSecondRoundSend(
  interviewId: string,
  claimedAt: Date,
  runner: Queryable = db,
): Promise<boolean> {
  if (!isUuid(interviewId)) return false;
  const rows = await runner.query<{ id: string }>(
    `UPDATE interviews
        SET second_round_sent_at = NULL
      WHERE id = $1 AND second_round_sent_at = $2
      RETURNING id`,
    [interviewId, claimedAt],
  );
  return rows.length > 0;
}
