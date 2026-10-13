import { SECOND_ROUND_THRESHOLD } from "./client";

import type { InterviewRow } from "@/lib/neon/types";

/**
 * Who gets offered a second round, and why the answer is a function rather
 * than an `if` on the page.
 *
 * The rule is read in two places that must not disagree: the application detail
 * page decides whether to render the button, and the server action decides
 * whether to honour the click. A server action is reachable by direct POST, so
 * the page's decision proves nothing — the action has to ask the same question
 * independently. One function, asked twice, is how those two answers stay the
 * same sentence.
 *
 * WHY A REASON CODE AND NOT A BOOLEAN. "No button" has four quite different
 * causes and the recruiter deserves to know which: the interview has not been
 * scored, it was scored below the bar, it was abandoned so the score means
 * nothing, or the invitation has already gone out. A boolean would render all
 * four as silence, and the fourth as a button that fails.
 */

export type SecondRoundEligibility =
  | { eligible: true; score: number }
  | {
      eligible: false;
      reason: "no-interview" | "not-scored" | "below-threshold" | "already-sent";
      /** Present whenever a score exists, so "below threshold" can name it. */
      score: number | null;
    };

/** The interview fields this rule reads. A subset, so tests need no row. */
export type SecondRoundInput = Pick<
  InterviewRow,
  "score" | "second_round_sent_at" | "status"
>;

export function secondRoundEligibility(
  interview: SecondRoundInput | null | undefined,
): SecondRoundEligibility {
  if (!interview) {
    return { eligible: false, reason: "no-interview", score: null };
  }

  // CHECKED BEFORE THE SCORE, deliberately. An invitation that has already
  // been sent must report itself as sent whatever the score says, because the
  // question the caller is really asking is "may I send this", and the answer
  // for a re-score that moved 9 to 7 is still no: the candidate already has
  // the email. second_round_sent_at is the only stop on a double-send.
  if (interview.second_round_sent_at) {
    return { eligible: false, reason: "already-sent", score: parseScore(interview.score) };
  }

  const score = parseScore(interview.score);
  if (score === null) {
    return { eligible: false, reason: "not-scored", score: null };
  }

  if (score < SECOND_ROUND_THRESHOLD) {
    return { eligible: false, reason: "below-threshold", score };
  }

  return { eligible: true, score };
}

/**
 * NUMERIC arrives from the driver as a string, not a number — see the note at
 * the top of lib/neon/types.ts. "8.50" has to become 8.5 before it can be
 * compared with the threshold, and `"8.50" >= 8` in JavaScript happens to be
 * true by coercion, which is exactly the kind of accident that holds until
 * somebody stores "10.00" and compares it against "9".
 *
 * Returns null for anything unparseable rather than 0: a missing score and a
 * zero score are different facts, and zero would read as "interviewed badly"
 * when the truth is "not interviewed".
 */
export function parseScore(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export { SECOND_ROUND_THRESHOLD };
