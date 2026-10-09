/**
 * Candidate reads and writes.
 *
 * A candidate is a person, deduplicated on email. The interesting part is the
 * upsert: a second application from the same person often carries less
 * information than the first (a quick apply with no phone, no LinkedIn), and
 * the naive upsert would overwrite good data with blanks.
 */

import { db, isUuid, likePattern, type Queryable } from "./client";
import type { CandidateRow } from "./types";

const CANDIDATE_COLUMNS = `
  id, email, first_name, last_name, phone, location,
  linkedin_url, portfolio_url, zoho_contact_id, created_at, updated_at
`;

export interface UpsertCandidateInput {
  email: string;
  /**
   * Names are optional here even though the columns are NOT NULL: a sparse
   * re-application should be able to pass email alone. On insert they fall back
   * to an empty string; on conflict an empty value is ignored, so the names
   * captured on the first application survive.
   */
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
  portfolioUrl?: string | null;
}

export class CandidateInputError extends Error {
  readonly code = "INVALID_EMAIL" as const;

  constructor(message: string) {
    super(message);
    this.name = "CandidateInputError";
  }
}

/**
 * Find-or-create a candidate by email.
 *
 * Conflict target is `(lower(email))`, which is the expression the unique index
 * is built on. Naming the expression rather than the column is required: an
 * `ON CONFLICT (email)` here would fail at runtime because no index matches it.
 *
 * Every updated column is wrapped in `COALESCE(NULLIF(EXCLUDED.x, ''), c.x)`:
 *   * NULLIF turns an empty submission into NULL,
 *   * COALESCE then falls back to what is already stored.
 * So a value only ever moves from absent to present, never the other way. An
 * actual erasure (candidate asks for their phone number to be removed) is a
 * deliberate act and belongs in its own function, not in an apply flow.
 *
 * `created` is read from `xmax = 0`, which is the standard way to tell an
 * INSERT from a DO UPDATE in one statement: the system column is zero on a row
 * this statement inserted and non-zero on one it updated.
 */
export async function upsertCandidateByEmail(
  input: UpsertCandidateInput,
  runner: Queryable = db,
): Promise<{ candidate: CandidateRow; created: boolean }> {
  const email = input.email.trim();
  if (email === "" || !email.includes("@")) {
    // The schema has no format CHECK on email, and the unique index is on
    // lower(email), so a blank would become a single shared "candidate" that
    // every malformed submission merges into.
    throw new CandidateInputError(`Not a usable email address: ${JSON.stringify(input.email)}`);
  }

  const rows = await runner.query<CandidateRow & { created: boolean }>(
    `INSERT INTO candidates (
       email, first_name, last_name, phone, location, linkedin_url, portfolio_url
     ) VALUES ($1, COALESCE($2, ''), COALESCE($3, ''), $4, $5, $6, $7)
     ON CONFLICT (lower(email)) DO UPDATE SET
       first_name    = COALESCE(NULLIF(EXCLUDED.first_name, ''), candidates.first_name),
       last_name     = COALESCE(NULLIF(EXCLUDED.last_name, ''), candidates.last_name),
       phone         = COALESCE(NULLIF(EXCLUDED.phone, ''), candidates.phone),
       location      = COALESCE(NULLIF(EXCLUDED.location, ''), candidates.location),
       linkedin_url  = COALESCE(NULLIF(EXCLUDED.linkedin_url, ''), candidates.linkedin_url),
       portfolio_url = COALESCE(NULLIF(EXCLUDED.portfolio_url, ''), candidates.portfolio_url)
     RETURNING ${CANDIDATE_COLUMNS}, (xmax = 0) AS created`,
    [
      email,
      trimOrNull(input.firstName),
      trimOrNull(input.lastName),
      trimOrNull(input.phone),
      trimOrNull(input.location),
      trimOrNull(input.linkedinUrl),
      trimOrNull(input.portfolioUrl),
    ],
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Upsert of candidates returned no row.");
  }

  const { created, ...candidate } = row;
  return { candidate, created };
}

export async function getCandidateById(
  id: string,
  runner: Queryable = db,
): Promise<CandidateRow | null> {
  if (!isUuid(id)) {
    return null;
  }
  const rows = await runner.query<CandidateRow>(
    `SELECT ${CANDIDATE_COLUMNS} FROM candidates WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Lookup by email, case-insensitively, so it matches the uniqueness rule.
 *
 * `lower(email) = lower($1)` is written on both sides deliberately: it is the
 * form that can use the `candidates_email_key` expression index.
 */
export async function getCandidateByEmail(
  email: string,
  runner: Queryable = db,
): Promise<CandidateRow | null> {
  const rows = await runner.query<CandidateRow>(
    `SELECT ${CANDIDATE_COLUMNS} FROM candidates WHERE lower(email) = lower($1)`,
    [email.trim()],
  );
  return rows[0] ?? null;
}

export interface ListCandidatesFilters {
  /** Free text, matched against email, first name, last name and location. */
  q?: string;
  /** true for candidates already in Zoho, false for ones still missing. */
  syncedToZoho?: boolean;
  limit?: number;
  offset?: number;
}

export async function listCandidates(
  filters: ListCandidatesFilters = {},
  runner: Queryable = db,
): Promise<CandidateRow[]> {
  const q = filters.q?.trim();

  return runner.query<CandidateRow>(
    `SELECT ${CANDIDATE_COLUMNS}
       FROM candidates
      WHERE ($1::text IS NULL OR
             email ILIKE $1 OR first_name ILIKE $1 OR
             last_name ILIKE $1 OR location ILIKE $1)
        AND ($2::boolean IS NULL OR (zoho_contact_id IS NOT NULL) = $2)
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4`,
    [
      q ? likePattern(q) : null,
      filters.syncedToZoho ?? null,
      clampLimit(filters.limit, 50),
      Math.max(0, filters.offset ?? 0),
    ],
  );
}

/**
 * Record the Zoho CRM contact id after a successful sync.
 *
 * Returns null when the candidate no longer exists, which is a real case: the
 * sync worker runs behind the request that enqueued it, and a candidate can be
 * deleted in between. A missing row is not an error for the worker.
 */
export async function setZohoContactId(
  candidateId: string,
  zohoId: string,
  runner: Queryable = db,
): Promise<CandidateRow | null> {
  const rows = await runner.query<CandidateRow>(
    `UPDATE candidates SET zoho_contact_id = $2 WHERE id = $1 RETURNING ${CANDIDATE_COLUMNS}`,
    [candidateId, zohoId],
  );
  return rows[0] ?? null;
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function clampLimit(limit: number | undefined, fallback: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(limit), 200);
}
