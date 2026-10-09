import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { query } from "@/lib/neon/client";

/**
 * Session, cookie and token handling for the Neon-backed admin area
 * (/admin/*). Completely separate from the Supabase auth that still guards the
 * old workspace at /app: different table (admin_sessions in db/neon/001_init.sql),
 * different cookie name, different guard functions. Nothing here reads or
 * writes a Supabase cookie, and nothing in lib/auth/ knows this file exists, so
 * the two systems can run side by side without either one being able to grant
 * access to the other's pages.
 *
 * Password hashing itself lives in lib/neon/admin-users.ts, which is
 * deliberately free of Next.js imports so scripts/create-admin.ts can use it
 * from a plain Node process. This file is the half that can only run inside a
 * request (cookies, headers, redirect), hence the `server-only` guard above.
 */

// ------------------------------------------------------------------- the cookie

/**
 * Named with the `ca_` prefix the repo already uses (see DEMO_CANDIDATE_COOKIE)
 * and an explicit `admin` segment. The important property is that it cannot
 * collide with anything Supabase sets: @supabase/ssr writes `sb-<ref>-auth-token`
 * (plus numbered chunks), and lib/candidate-portal/session.ts identifies those
 * by the `sb-` prefix. A name in a different namespace means clearing or
 * rotating one system's cookies can never disturb the other's.
 */
export const SESSION_COOKIE = "ca_admin_session";

/** Seven days, per the brief. Sessions are not slid forward on use: re-writing
 *  the row on every request would turn a read-only auth check into a write. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * `secure` only in production because http://localhost is not a secure origin —
 * a Secure cookie would simply never be stored during local development, making
 * sign-in appear to succeed and then instantly fail.
 *
 * `sameSite: "lax"` rather than "strict" so a staff member following a link to
 * /admin/... from an email arrives already signed in. Lax still withholds the
 * cookie from cross-site POSTs, which is where CSRF actually lives.
 */
export function sessionCookieAttributes(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieAttributes(SESSION_TTL_SECONDS));
}

/**
 * Overwrite-then-expire rather than delete: a cookie is only replaced when the
 * name, path and domain all match, so writing an empty value with the same
 * attributes is the reliable way to be rid of it.
 *
 * Only usable where the cookie store is mutable (server action, route handler).
 * app/admin/logout/route.ts writes the cleared cookie onto its redirect
 * response instead, using the same attributes from sessionCookieAttributes.
 */
export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", sessionCookieAttributes(0));
}

export async function readSessionCookie(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

// -------------------------------------------------------------------- tokens

/** 32 bytes of CSPRNG output, hex-encoded: 64 characters, 256 bits of entropy. */
function newOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * SHA-256, not bcrypt, and that is deliberate. A slow KDF protects secrets that
 * have guessable structure — a human-chosen password. These tokens are 256 bits
 * of uniform randomness, so there is nothing to brute force and a slow hash
 * would only tax getSessionUser(), which runs on every admin request. What the
 * hash buys is that a dump of admin_sessions cannot be replayed as a login.
 */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Cheap shape check so a forged or stale cookie never costs a database round
 *  trip. Our tokens are always exactly 64 lowercase hex characters. */
const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

// ------------------------------------------------------------------ sessions

export type AdminRole = "OWNER" | "ADMIN" | "RECRUITER";

export type AdminSessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  mustChangePassword: boolean;
};

/**
 * Issues a session and returns the RAW token. Only its SHA-256 reaches the
 * database; the raw value exists in this process long enough to be put in a
 * cookie and is never logged.
 *
 * The data-modifying CTE prunes expired rows in the same round trip as the
 * insert. Postgres runs a WITH-clause DELETE exactly once and to completion
 * even though nothing reads its output, so this is free housekeeping on an
 * indexed column (admin_sessions_expiry_idx) and means the table does not need
 * a cron job to stay small.
 */
export async function createSession(
  adminUserId: string,
  ip?: string | null,
  userAgent?: string | null,
): Promise<string> {
  const token = newOpaqueToken();
  await query(
    `WITH pruned AS (
       DELETE FROM admin_sessions WHERE expires_at < NOW() RETURNING 1
     )
     INSERT INTO admin_sessions (admin_user_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 second'), $4, $5)`,
    [
      adminUserId,
      hashToken(token),
      String(SESSION_TTL_SECONDS),
      ip ?? null,
      // Truncated: a user-agent is attacker-controlled and only ever read by a
      // human reviewing sessions, so there is no reason to store kilobytes.
      userAgent ? userAgent.slice(0, 400) : null,
    ],
  );
  return token;
}

type SessionRow = {
  id: string;
  email: string;
  full_name: string;
  role: AdminRole;
  must_change_password: boolean;
};

/**
 * The signed-in admin, or null. Runs on every admin request, so it is one
 * indexed lookup (admin_sessions.token_hash is UNIQUE) joined to admin_users,
 * wrapped in React `cache` so a layout, a page and three server components in
 * the same render share a single query.
 *
 * Expiry and is_active are both checked in SQL rather than in JavaScript: that
 * way deactivating an account takes effect on the deactivated user's very next
 * request instead of whenever their 7-day session happens to lapse.
 *
 * Does not swallow database errors. If Neon is unreachable this throws, which
 * means requireAdmin() fails closed instead of treating an outage as "no
 * session, show the login page" — or worse, as a session.
 */
export const getSessionUser = cache(async (): Promise<AdminSessionUser | null> => {
  const token = await readSessionCookie();
  if (!token || !TOKEN_SHAPE.test(token)) return null;

  const rows = await query<SessionRow>(
    `SELECT u.id, u.email, u.full_name, u.role, u.must_change_password
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.admin_user_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()
        AND u.is_active
      LIMIT 1`,
    [hashToken(token)],
  );

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    mustChangePassword: row.must_change_password,
  };
});

/** Revokes one session by its raw token. Safe to call with a token that is
 *  already gone — sign-out should never error. */
export async function destroySession(token: string): Promise<void> {
  if (!TOKEN_SHAPE.test(token)) return;
  await query(`DELETE FROM admin_sessions WHERE token_hash = $1`, [hashToken(token)]);
}

/**
 * Revokes every session for one account. Lives in admin-users.ts (as
 * invalidateAllSessions) so that module stays importable from the CLI; it is
 * re-exported here because callers reaching for "destroy sessions" look in the
 * session module first.
 */
export { invalidateAllSessions as destroyAllSessions } from "@/lib/neon/admin-users";

// ------------------------------------------------------- password reset tokens

/** One hour. Long enough to find the email, short enough that a reset link
 *  sitting in an unattended inbox stops being a credential by lunchtime. */
export const RESET_TTL_SECONDS = 60 * 60;

/** Mints a single-use reset token and returns the RAW value for the email.
 *  Only the SHA-256 is stored, exactly as for sessions. */
export async function createPasswordResetToken(adminUserId: string): Promise<string> {
  const token = newOpaqueToken();
  await query(
    `INSERT INTO admin_password_resets (admin_user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3::int * INTERVAL '1 second'))`,
    [adminUserId, hashToken(token), String(RESET_TTL_SECONDS)],
  );
  return token;
}

/**
 * Claims a reset token, returning the account it belongs to or null.
 *
 * Single UPDATE on purpose: setting used_at and checking that it was unset are
 * the same statement, so two requests racing with the same token cannot both
 * win — Postgres row locking makes the second one match zero rows. Checking
 * used_at IS NULL in a SELECT and then updating would be exactly the race this
 * avoids. The row is kept rather than deleted so a replay attempt stays
 * visible to anyone auditing the table.
 */
export async function claimPasswordResetToken(raw: string): Promise<string | null> {
  if (!TOKEN_SHAPE.test(raw)) return null;
  const rows = await query<{ admin_user_id: string }>(
    `UPDATE admin_password_resets AS r
        SET used_at = NOW()
      WHERE r.token_hash = $1
        AND r.used_at IS NULL
        AND r.expires_at > NOW()
        AND EXISTS (SELECT 1 FROM admin_users u WHERE u.id = r.admin_user_id AND u.is_active)
      RETURNING r.admin_user_id`,
    [hashToken(raw)],
  );
  return rows[0]?.admin_user_id ?? null;
}

/**
 * Read-only check used when rendering the reset form, so an expired or
 * already-used link says so immediately instead of after the user has typed a
 * new password twice. Does NOT consume the token.
 */
export async function isPasswordResetTokenUsable(raw: string): Promise<boolean> {
  if (!TOKEN_SHAPE.test(raw)) return false;
  const rows = await query<{ ok: boolean }>(
    `SELECT TRUE AS ok
       FROM admin_password_resets r
       JOIN admin_users u ON u.id = r.admin_user_id
      WHERE r.token_hash = $1
        AND r.used_at IS NULL
        AND r.expires_at > NOW()
        AND u.is_active
      LIMIT 1`,
    [hashToken(raw)],
  );
  return rows.length > 0;
}

/** Voids any outstanding reset links for an account. Called after a successful
 *  password change: an old link must not still work against a new password. */
export async function revokePasswordResetTokens(adminUserId: string): Promise<void> {
  await query(
    `UPDATE admin_password_resets SET used_at = NOW()
      WHERE admin_user_id = $1 AND used_at IS NULL`,
    [adminUserId],
  );
}

// ---------------------------------------------------------- returnTo handling

const ADMIN_PREFIX = "/admin";

/**
 * The only post-sign-in destinations we will honour. An unvalidated ?returnTo=
 * is an open redirect, which is how a phishing page borrows our domain's
 * credibility.
 *
 * Rejected outright: anything not starting with a single "/", so absolute URLs
 * ("https://evil.com") and protocol-relative ones ("//evil.com") are gone;
 * backslashes, because several browsers normalise "/\evil.com" to a
 * protocol-relative URL; whitespace and control characters, which are used to
 * smuggle past exactly this kind of check; and "..", which cannot appear in a
 * legitimate link.
 *
 * The prefix test is `=== "/admin"` or `startsWith("/admin/")` rather than
 * `startsWith("/admin")` — the latter would also accept "/administrator-evil".
 */
export function sanitizeAdminReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  let decoded = value.trim();
  if (!decoded) return null;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return null;
  }
  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    decoded.includes("://") ||
    decoded.includes("..") ||
    // Whitespace, C0 controls and DEL: all three are used to smuggle a payload
    // past a naive prefix check, and none can appear in a real in-app link.
    /[\s\u0000-\u001f\u007f]/.test(decoded)
  ) {
    return null;
  }
  const path = decoded.split(/[?#]/)[0] ?? "";
  if (path !== ADMIN_PREFIX && !path.startsWith(`${ADMIN_PREFIX}/`)) return null;
  // The path only. Dropping any query string keeps this function's output a
  // closed set and stops a crafted ?returnTo= from seeding other parameters.
  return path;
}

export const DEFAULT_ADMIN_LANDING = "/admin/dashboard";
export const ADMIN_LOGIN_PATH = "/admin/login";

export function adminLoginUrl(returnTo?: string | null): string {
  const safe = sanitizeAdminReturnTo(returnTo);
  return safe ? `${ADMIN_LOGIN_PATH}?returnTo=${encodeURIComponent(safe)}` : ADMIN_LOGIN_PATH;
}

// ----------------------------------------------------------------- the guards

/**
 * Server-side gate for any /admin page or action.
 *
 * `returnTo` is a parameter rather than something read from the request because
 * a layout cannot see the URL it is rendering — the same limitation the
 * candidate portal works around with a header set in proxy.ts. proxy.ts does
 * not match /admin/*, and adding it there would couple this new system to the
 * Supabase session refresh running in that file, so callers pass their own path.
 *
 * An admin carrying must_change_password is sent to /admin/reset-password and
 * cannot reach anything else. That page reads getSessionUser() directly rather
 * than calling requireAdmin(), which is what stops the redirect looping.
 */
export async function requireAdmin(options: { returnTo?: string | null } = {}): Promise<AdminSessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(adminLoginUrl(options.returnTo));
  if (user.mustChangePassword) redirect("/admin/reset-password");
  return user;
}

/**
 * requireAdmin plus a role check. Sent to the dashboard rather than to the
 * login page on failure: the user is signed in correctly, they simply are not
 * allowed here, and bouncing them to a login form they have already passed is
 * the kind of loop that generates support tickets.
 */
export async function requireRole(
  roles: readonly AdminRole[],
  options: { returnTo?: string | null } = {},
): Promise<AdminSessionUser> {
  const user = await requireAdmin(options);
  if (!roles.includes(user.role)) redirect(`${DEFAULT_ADMIN_LANDING}?notice=forbidden`);
  return user;
}

// ------------------------------------------------------------- user-facing copy

/**
 * Every notice the four admin auth pages can show, in one table.
 *
 * `invalid` is the whole point of this being centralised. An unknown email, a
 * wrong password and a deactivated account must be indistinguishable: if
 * "no such account" and "wrong password" read differently, the login form
 * becomes a free query interface for "does this person work here", which is the
 * first step of a credential-stuffing run and of a targeted phishing campaign.
 * Keeping the three cases pointed at one constant means a later edit cannot
 * accidentally split them — there is only one string to edit.
 */
export const SIGN_IN_FAILURE = "Email or password is incorrect.";

export type AuthNotice =
  | "invalid"
  | "missing"
  | "email-invalid"
  | "throttled"
  | "unavailable"
  | "signed-out"
  | "reset-sent"
  | "reset-done"
  | "reset-invalid"
  | "password-weak"
  | "password-mismatch"
  | "forbidden";

export const AUTH_NOTICES: Record<AuthNotice, { tone: "error" | "ok"; message: string }> = {
  invalid: { tone: "error", message: SIGN_IN_FAILURE },
  missing: { tone: "error", message: "Please enter your email and password." },
  "email-invalid": { tone: "error", message: "Please enter a valid email address." },
  throttled: {
    tone: "error",
    message: "Too many sign-in attempts from this device. Please wait a few minutes and try again.",
  },
  unavailable: { tone: "error", message: "Sign-in is temporarily unavailable. Please try again in a moment." },
  "signed-out": { tone: "ok", message: "You have been signed out." },
  // Shown whether or not the address matched an account. See the forgot-password action.
  "reset-sent": { tone: "ok", message: "If that address has an account, we have sent a reset link." },
  "reset-done": { tone: "ok", message: "Your password has been changed. Please sign in." },
  "reset-invalid": {
    tone: "error",
    message: "That reset link is no longer valid. Links expire after an hour and can only be used once.",
  },
  "password-weak": { tone: "error", message: "Choose a password of at least 12 characters." },
  "password-mismatch": { tone: "error", message: "Those two passwords do not match." },
  forbidden: { tone: "error", message: "Your account does not have access to that area." },
};

export function isAuthNotice(value: string | null | undefined): value is AuthNotice {
  return !!value && Object.prototype.hasOwnProperty.call(AUTH_NOTICES, value);
}

// ------------------------------------------------------------- the rate limiter

/**
 * WHERE THE STATE LIVES: in this module's memory, as a fixed-window counter per
 * (email + IP).
 *
 * Why not a database table: the obvious home would be a Neon table, but adding
 * one means editing db/neon/001_init.sql, which this change is not allowed to
 * touch, and a write-per-attempt against a serverless Postgres is a slow and
 * expensive way to count. Why not reuse lib/assistant/rate-limit.ts: it stores
 * its windows in a Supabase table, and the whole point of lib/neon/* is that
 * the admin system has no Supabase dependency.
 *
 * What this honestly gives us: on Vercel each function instance holds its own
 * map, so a distributed attacker spread across cold starts gets more than
 * `maxAttempts` tries overall. That is acceptable because it is the second line
 * of defence, not the first — bcrypt at cost 12 already caps any single
 * instance at a couple of guesses per second, and the counter reliably stops
 * the common case of one script hammering one address.
 *
 * FAILING OPEN IS THE DELIBERATE CHOICE. A limiter that fails closed on a bad
 * day locks every administrator out of their own dashboard with no way back in,
 * and there is no second door — there is no public registration and no
 * alternative admin login. A brute-force window is recoverable; a permanent
 * lockout of all staff is not. Hence: entries always carry an expiry, the map
 * is bounded and dropped wholesale rather than growing, and consume() returns
 * `true` (allowed) if anything unexpected happens.
 *
 * The upgrade path, when a migration slot is available, is a Neon table keyed
 * on this same bucket string with the same window semantics.
 */
export const LOGIN_RATE_LIMIT = { windowSeconds: 15 * 60, maxAttempts: 10 } as const;
export const RESET_REQUEST_RATE_LIMIT = { windowSeconds: 60 * 60, maxAttempts: 5 } as const;

type FixedWindow = { expiresAt: number; count: number };

const windows = new Map<string, FixedWindow>();
const MAX_TRACKED_BUCKETS = 20_000;

/**
 * Buckets are salted SHA-256 digests, so neither a staff email address nor a
 * client IP sits in process memory in the clear — the same treatment
 * lib/assistant/rate-limit.ts gives visitor IPs. The salt is reused from
 * ASSISTANT_RATE_LIMIT_SALT when set; a fixed fallback is fine because the
 * digest is a local map key, not a stored credential.
 */
export function rateLimitBucket(scope: string, ...parts: string[]): string {
  const salt = process.env.ASSISTANT_RATE_LIMIT_SALT || "consult-america-admin-auth";
  const digest = createHash("sha256").update([salt, scope, ...parts].join(" ")).digest("hex");
  return `${scope}:${digest.slice(0, 40)}`;
}

/** Records one attempt. Returns false only when the bucket is over its limit. */
export function consumeRateLimit(
  bucket: string,
  limit: { windowSeconds: number; maxAttempts: number },
  now: number = Date.now(),
): boolean {
  try {
    if (windows.size > MAX_TRACKED_BUCKETS) {
      for (const [key, entry] of windows) if (entry.expiresAt <= now) windows.delete(key);
      // Still over the cap: drop everything rather than keep growing. Fails
      // open by design (see the note above) and self-heals within one window.
      if (windows.size > MAX_TRACKED_BUCKETS) windows.clear();
    }
    const existing = windows.get(bucket);
    const entry =
      existing && existing.expiresAt > now
        ? existing
        : { expiresAt: now + limit.windowSeconds * 1000, count: 0 };
    entry.count += 1;
    windows.set(bucket, entry);
    return entry.count <= limit.maxAttempts;
  } catch {
    return true;
  }
}

/** Clears a bucket after a success, so a staff member who fumbles their
 *  password four times is not then throttled for the rest of the window. */
export function releaseRateLimit(bucket: string): void {
  windows.delete(bucket);
}

/**
 * Best-effort client IP. Duplicated from lib/assistant/rate-limit.ts rather
 * than imported, because that module pulls in the Supabase service client and
 * lib/neon/* is meant to have no Supabase dependency at all.
 *
 * x-forwarded-for is set by Vercel's edge and its first entry is the client.
 * "unknown" is a legitimate value: it just means every unidentified caller
 * shares one bucket, which is the safe direction to be wrong in.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || "unknown";
  return h.get("x-real-ip")?.trim() || "unknown";
}

export async function clientUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent");
}
