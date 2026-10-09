import { compare, hash } from "bcryptjs";

import { UNIQUE_VIOLATION, isPgError, isUuid, query } from "@/lib/neon/client";

/**
 * Reads and writes for admin_users (db/neon/001_init.sql), plus the password
 * hashing primitives.
 *
 * NO `import "server-only"` HERE, ON PURPOSE. The `server-only` package throws
 * the moment it is imported outside a React Server Component graph, and
 * scripts/create-admin.ts has to be able to create the very first
 * administrator from a plain Node process — there is no public registration
 * path, so that CLI is the only way an account can come into existence. The
 * module is still unreachable from the browser in practice: it imports
 * lib/neon/client.ts, which needs DATABASE_URL and a Postgres driver. Anything
 * that genuinely cannot leave a request (cookies, headers, redirect) lives in
 * lib/neon/auth.ts, which does carry the guard.
 *
 * This module imports nothing from lib/neon/auth.ts, so the dependency runs
 * one way (auth -> admin-users) and there is no cycle.
 */

// -------------------------------------------------------------- password hashing

/**
 * bcryptjs, NOT @node-rs/argon2.
 *
 * Argon2id is the better algorithm, and if this ran on a long-lived server it
 * would be the choice. It is rejected here because of how it has to get onto
 * Vercel: @node-rs/argon2 is a native NAPI addon that ships its real
 * implementation in per-platform optional dependencies (argon2-linux-x64-gnu,
 * -musl, darwin-arm64, and so on). That means the deployed bundle is only
 * correct if Next's file tracing happens to pull the right binary into the
 * serverless function, which is exactly the class of problem that fails at
 * runtime in production rather than at build time locally, and usually needs a
 * serverExternalPackages entry to work at all. It is also unusable from the
 * Edge runtime, which closes off ever moving this check into middleware.
 *
 * bcryptjs is pure JavaScript: no binaries, no optional deps, no platform
 * matrix, nothing for a bundler to get wrong, and it behaves identically on a
 * Mac laptop, in a Vercel function and in the `npx tsx` CLI below. The cost is
 * speed, and here speed does not matter: this is an admin login used by a
 * handful of staff a few times a day, not a consumer sign-up endpoint.
 *
 * Known bcrypt behaviour, recorded so nobody rediscovers it as a bug: only the
 * first 72 bytes of a password take part in the hash. With a 12-character
 * minimum there is far more entropy than needed inside that window, so long
 * passphrases are accepted rather than rejected, and the tail is simply
 * ignored the way it is in every other bcrypt deployment.
 */
export const BCRYPT_COST = 12;

/** Matches the brief's reset-form rule. Enforced here too, so no caller can
 *  write a short password by skipping the form. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * A real bcrypt hash of a random throwaway string that was never recorded. It
 * exists so an unknown email costs the same work as a known one — see
 * verifyPassword. Not a secret: nothing in the system accepts the password it
 * encodes, because nobody knows it. Precomputed rather than generated at
 * import time so a cold start does not pay for a hash it may never need, and
 * so the first unknown-user request is not measurably slower than the second.
 */
const DUMMY_HASH = "$2b$12$PtwNcSb25hbSV1WIHgXl.eNPUPshUtouqFPr8ar5qdOThkL2dBy5O";

export class WeakPasswordError extends Error {
  constructor() {
    super(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    this.name = "WeakPasswordError";
  }
}

export class AdminUserExistsError extends Error {
  constructor(email: string) {
    // The email is safe to name here: this is thrown to an operator at a
    // terminal or to another signed-in admin, never to an anonymous visitor.
    super(`An active admin already exists for ${email}.`);
    this.name = "AdminUserExistsError";
  }
}

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < MIN_PASSWORD_LENGTH) throw new WeakPasswordError();
  return hash(plain, BCRYPT_COST);
}

/**
 * Compares a submitted password against a stored hash.
 *
 * `hashed` is nullable and that is the whole point: callers pass
 * `user?.passwordHash ?? null`, and a null makes this compare against
 * DUMMY_HASH and return false. So "no such account" performs exactly one
 * bcrypt comparison, the same as "wrong password" and the same as "correct
 * password for a deactivated account". Without it, an unknown email would
 * return in about a millisecond while a known one took a few hundred, and the
 * login form would leak the staff directory by stopwatch no matter how
 * carefully the error strings were matched.
 *
 * Never throws: a malformed hash in the database is a failed login, not a 500.
 */
export async function verifyPassword(plain: string, hashed: string | null): Promise<boolean> {
  try {
    if (!hashed) {
      await compare(plain, DUMMY_HASH);
      return false;
    }
    return await compare(plain, hashed);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ the records

export type AdminRole = "OWNER" | "ADMIN" | "RECRUITER";

export const ADMIN_ROLES: readonly AdminRole[] = ["OWNER", "ADMIN", "RECRUITER"];

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date | null;
};

/** Only ever returned by findByEmail, and only ever consumed by the sign-in
 *  action. Separated from AdminUser so a hash cannot wander into a list view. */
export type AdminUserWithSecret = AdminUser & { passwordHash: string };

type AdminUserRow = {
  id: string;
  email: string;
  full_name: string;
  role: AdminRole;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | Date | null;
  created_at: string | Date | null;
  password_hash?: string;
};

/**
 * Timestamp columns come back as a Date from the node driver and as a string
 * from the HTTP driver depending on how the shared client is configured, so
 * normalise instead of assuming.
 */
function toDate(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function mapUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
    lastLoginAt: toDate(row.last_login_at),
    createdAt: toDate(row.created_at),
  };
}

/** Trim and lower-case, matching the `lower(email)` unique index: Admin@x.com
 *  and admin@x.com are one account, so they must also be one lookup key. */
export function normalizeEmail(email: string): string {
  // 254 is the practical maximum length of an email address; the cap stops an
  // oversized form field reaching the database at all.
  return email.trim().toLowerCase().slice(0, 254);
}

// ------------------------------------------------------------------- the queries

const USER_COLUMNS = `id, email, full_name, role, is_active, must_change_password, last_login_at, created_at`;

/**
 * Looks an account up by email, including the password hash and including
 * DEACTIVATED accounts.
 *
 * Inactive rows are returned deliberately. If this filtered on is_active, the
 * sign-in action would get a null for a deactivated admin and take the
 * dummy-hash branch — which would still be constant-time, but would also mean
 * the action could not tell the two cases apart for logging. Returning the row
 * and having the caller check isActive AFTER the bcrypt comparison keeps every
 * failure path at exactly one hash while leaving the distinction visible
 * server-side.
 */
export async function findByEmail(email: string): Promise<AdminUserWithSecret | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const rows = await query<AdminUserRow>(
    `SELECT ${USER_COLUMNS}, password_hash
       FROM admin_users
      WHERE lower(email) = $1
      LIMIT 1`,
    [normalized],
  );
  const row = rows[0];
  if (!row || typeof row.password_hash !== "string") return null;
  return { ...mapUser(row), passwordHash: row.password_hash };
}

/** Screens the id first: comparing a malformed string against a uuid column
 *  raises invalid_text_representation, turning a miss into a 500. */
export async function findById(id: string): Promise<AdminUser | null> {
  if (!isUuid(id)) return null;
  const rows = await query<AdminUserRow>(
    `SELECT ${USER_COLUMNS} FROM admin_users WHERE id = $1 LIMIT 1`,
    [id],
  );
  const row = rows[0];
  return row ? mapUser(row) : null;
}

/**
 * Replaces an account's password.
 *
 * Clears must_change_password in the same statement, because the only reason
 * that flag exists is to force the user here. Then revokes every session the
 * account holds: after a password change, any session opened with the old
 * password is a session belonging to whoever knew the old password, including
 * the attacker the change is meant to evict. Callers that need the user to stay
 * signed in (the forced-change flow) issue a fresh session afterwards.
 */
export async function setPassword(
  adminUserId: string,
  plainPassword: string,
  options: { invalidateSessions?: boolean } = {},
): Promise<boolean> {
  if (!isUuid(adminUserId)) return false;
  const passwordHash = await hashPassword(plainPassword);
  const rows = await query<{ id: string }>(
    `UPDATE admin_users
        SET password_hash = $2, must_change_password = FALSE
      WHERE id = $1
      RETURNING id`,
    [adminUserId, passwordHash],
  );
  if (rows.length === 0) return false;
  if (options.invalidateSessions !== false) await invalidateAllSessions(adminUserId);
  return true;
}

/**
 * Creates an admin. The only way an account is born — there is no public
 * registration anywhere in this system, by design.
 *
 * Checks for an existing active account first so the common case gets a clear
 * message, and still handles the unique-violation (SQLSTATE 23505) from the
 * `lower(email)` index, which is what two operators running the CLI at the
 * same second would hit.
 */
export async function createAdminUser(input: {
  email: string;
  fullName: string;
  password: string;
  role?: AdminRole;
  mustChangePassword?: boolean;
}): Promise<AdminUser> {
  const email = normalizeEmail(input.email);
  const fullName = input.fullName.trim();
  if (!email) throw new Error("An email address is required.");
  if (!fullName) throw new Error("A full name is required.");

  const existing = await findByEmail(email);
  if (existing?.isActive) throw new AdminUserExistsError(email);

  const passwordHash = await hashPassword(input.password);
  const role: AdminRole = input.role ?? "RECRUITER";

  try {
    const rows = await query<AdminUserRow>(
      `INSERT INTO admin_users (email, password_hash, full_name, role, must_change_password)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${USER_COLUMNS}`,
      [email, passwordHash, fullName, role, input.mustChangePassword ?? false],
    );
    const row = rows[0];
    if (!row) throw new Error("Insert returned no row.");
    return mapUser(row);
  } catch (error) {
    // The lower(email) unique index losing a race with another insert.
    if (isPgError(error, UNIQUE_VIOLATION)) throw new AdminUserExistsError(email);
    throw error;
  }
}

/** Every admin, newest last, without password hashes. */
export async function listAdminUsers(
  options: { includeInactive?: boolean } = {},
): Promise<AdminUser[]> {
  const rows = await query<AdminUserRow>(
    `SELECT ${USER_COLUMNS}
       FROM admin_users
      WHERE $1::boolean OR is_active
      ORDER BY created_at ASC`,
    [options.includeInactive ?? true],
  );
  return rows.map(mapUser);
}

/**
 * Soft-deletes an account and revokes its sessions in the same breath.
 *
 * Without the revoke, is_active = FALSE would not take effect until the user's
 * 7-day cookie lapsed, which is not what anyone means by "remove their
 * access". (getSessionUser also filters on is_active, so this is belt and
 * braces — but the row should not linger either way.)
 *
 * Returns false when no such account exists, so a caller can report honestly.
 */
export async function deactivateAdminUser(adminUserId: string): Promise<boolean> {
  if (!isUuid(adminUserId)) return false;
  const rows = await query<{ id: string }>(
    `UPDATE admin_users SET is_active = FALSE WHERE id = $1 AND is_active RETURNING id`,
    [adminUserId],
  );
  await invalidateAllSessions(adminUserId);
  return rows.length > 0;
}

/** Stamps a successful sign-in. Fire-and-forget from the caller's point of
 *  view: failing to record a login must not fail the login. */
export async function recordLogin(adminUserId: string): Promise<void> {
  if (!isUuid(adminUserId)) return;
  await query(`UPDATE admin_users SET last_login_at = NOW() WHERE id = $1`, [adminUserId]);
}

/**
 * Revokes every session for one account.
 *
 * The statement lives in this module rather than in lib/neon/auth.ts so that
 * setPassword and deactivateAdminUser can use it without this module having to
 * import the `server-only` half of the system (see the header note).
 * lib/neon/auth.ts re-exports it as destroyAllSessions.
 */
export async function invalidateAllSessions(adminUserId: string): Promise<void> {
  if (!isUuid(adminUserId)) return;
  await query(`DELETE FROM admin_sessions WHERE admin_user_id = $1`, [adminUserId]);
}
