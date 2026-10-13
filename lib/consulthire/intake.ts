import "server-only";

import { tx } from "@/lib/neon/client";

/**
 * Creates the candidate and application for an AI interview that arrived
 * without one.
 *
 * WHY THIS EXISTS. Candidates who choose "Apply with AI" go straight from the
 * job posting into the interview. They are not asked for a name and email on
 * the Consult America site first, because ConsultHire asks for exactly those
 * two things at the start of the interview and asking twice for one action is
 * one form too many. So the first time this system hears about such a person
 * is when their completed interview is delivered.
 *
 * TRUST. Everything here comes out of a webhook body whose HMAC signature was
 * verified before this function was called. That is the only reason an email
 * address arriving over HTTP is allowed to create a candidate record.
 *
 * IDEMPOTENT ON THE SESSION. ConsultHire may deliver the same completion more
 * than once, and the whole point of this path is that it runs before any
 * application exists, so there is no existing row to collide with. The session
 * id is the key: if an interview already carries it, its application is
 * returned rather than a second one being created. Without that, a single
 * retried webhook would give one person two applications for one interview.
 */

export type InterviewIntake = {
  /** jobs.id, as stored on the ConsultHire role. */
  externalJobId: string;
  /** Already lowercased by the caller. */
  candidateEmail: string;
  /** May be empty: ConsultHire requires a name, but an empty one is survivable. */
  candidateName: string;
  /** ConsultHire's session id. The idempotency key. */
  sessionId: string;
};

/** Splits a display name into first and last, the way the apply form stores it. */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/**
 * Returns the application id, or null when the job no longer exists.
 *
 * One transaction. A candidate without an application, or an application
 * without the interview row the caller is about to fill in, would both be
 * worse than the whole thing failing and being retried.
 */
export async function createApplicationForInterview(
  input: InterviewIntake,
): Promise<string | null> {
  return tx(async (t) => {
    // Already recorded by an earlier delivery of this same webhook.
    const existing = await t.query<{ application_id: string }>(
      `SELECT application_id FROM interviews WHERE consulthire_interview_id = $1 LIMIT 1`,
      [input.sessionId],
    );
    if (existing[0]) return existing[0].application_id;

    const jobs = await t.query<{ id: string; reference: string }>(
      `SELECT id, reference FROM jobs WHERE id = $1`,
      [input.externalJobId],
    );
    const job = jobs[0];
    if (!job) return null;

    const { first, last } = splitName(input.candidateName);

    /*
      One person, one candidate row, keyed on email. Somebody who applied by
      form last week and by AI interview today is the same human being and must
      not become two records. The name is only filled in where it is missing,
      so an AI interview cannot overwrite the fuller details a candidate typed
      on an application form.
    */
    const candidates = await t.query<{ id: string }>(
      `INSERT INTO candidates (email, first_name, last_name)
            VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
            SET first_name = CASE WHEN candidates.first_name = '' THEN EXCLUDED.first_name
                                  ELSE candidates.first_name END,
                last_name  = CASE WHEN candidates.last_name = '' THEN EXCLUDED.last_name
                                  ELSE candidates.last_name END
         RETURNING id`,
      [input.candidateEmail, first, last],
    );
    const candidateId = candidates[0].id;

    /*
      The application reference, allocated the same way the apply flow does it,
      under an advisory lock so two webhooks arriving together cannot be handed
      the same number. The lock is released when the transaction ends.
    */
    await t.query(`SELECT pg_advisory_xact_lock(hashtext('application_reference'))`);
    const refRows = await t.query<{ reference: string }>(
      `SELECT 'APP-' || to_char(now(), 'YYYY') || '-' ||
              lpad((COALESCE(MAX(NULLIF(regexp_replace(reference, '^APP-\\d{4}-', ''), '')::int), 0) + 1)::text, 4, '0')
              AS reference
         FROM applications
        WHERE reference LIKE 'APP-' || to_char(now(), 'YYYY') || '-%'`,
    );
    const reference = refRows[0].reference;

    /*
      A candidate who already applied to this job by form does not get a second
      application: the interview attaches to the one that exists. Two rows for
      one person and one opening is the thing the whole schema is shaped to
      prevent.
    */
    const applications = await t.query<{ id: string }>(
      `INSERT INTO applications (reference, job_id, candidate_id, status, method, source)
            VALUES ($1, $2, $3, 'NEW', 'AI_INTERVIEW', 'careers')
       ON CONFLICT (job_id, candidate_id) DO UPDATE
            SET updated_at = now()
         RETURNING id`,
      [reference, job.id, candidateId],
    );
    const applicationId = applications[0].id;

    /*
      The interview row the caller is about to fill in with the score. Created
      here rather than left to the recorder so that the unique session id is
      claimed inside this same transaction, which is what makes a concurrent
      duplicate delivery lose the race cleanly instead of producing two rows.
    */
    await t.query(
      `INSERT INTO interviews (application_id, kind, status, consulthire_interview_id)
            VALUES ($1, 'AI_SCREEN', 'IN_PROGRESS', $2)
       ON CONFLICT (consulthire_interview_id) DO NOTHING`,
      [applicationId, input.sessionId],
    );

    return applicationId;
  });
}
