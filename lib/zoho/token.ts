/**
 * Zoho CRM OAuth access-token management.
 *
 * The refresh token is long-lived and lives in `zoho_oauth_tokens` (row
 * name = 'production'). Access tokens last 3600s and are cached in the same
 * row, so every serverless instance of this app shares one token rather than
 * minting its own.
 *
 * That sharing is the point. Zoho caps refresh-token grant calls, and a client
 * that thrashes the token endpoint gets blocked outright, which would take the
 * CRM integration down until an operator intervenes. Two mechanisms keep the
 * refresh rate at roughly one per hour regardless of traffic:
 *
 *   1. A module-level in-flight promise. Within one instance, concurrent
 *      callers await the same refresh instead of each starting one.
 *   2. A Postgres advisory lock held across the HTTP refresh. Across
 *      instances, only one process can be refreshing at a time; everyone else
 *      queues on the lock and then finds the freshly stored token already
 *      waiting for them, so they never call Zoho at all.
 *
 * Neither mechanism alone is enough: (1) does nothing about a second Lambda,
 * and (2) would have every concurrent caller in one instance competing for a
 * pooled connection.
 *
 * No token value — refresh or access — is ever logged, included in an error
 * message, or returned in an API response from this module.
 */

import { db, isPgError, tx, type Queryable } from "@/lib/neon/client";

/** The `zoho_oauth_tokens` row this app uses. */
export const ZOHO_TOKEN_NAME = "production";

/**
 * Treat a token as expired this far before its real expiry, so a request that
 * starts just under the wire does not arrive with a dead token.
 */
const REFRESH_SAFETY_MS = 60_000;

/** Zoho's documented access-token lifetime, used when the grant omits it. */
const DEFAULT_EXPIRES_IN_SECONDS = 3600;

const TOKEN_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Advisory lock key for the token refresh.
 *
 * Deliberately a different class from the reference-number allocator in
 * lib/neon/client.ts (918_273): advisory locks share one namespace per
 * database, so two unrelated features using the same (class, key) pair would
 * serialise against each other for no reason.
 */
const ZOHO_LOCK_CLASS = 918_274;
const ZOHO_TOKEN_LOCK_KEY = 1;

/**
 * How long to wait for the advisory lock before giving up. Longer than the
 * token request timeout, so a healthy holder always finishes first and a
 * timeout here really does mean something is wedged.
 */
const LOCK_TIMEOUT = "20s";

/** Postgres SQLSTATE raised when `lock_timeout` fires. */
const LOCK_NOT_AVAILABLE = "55P03";

// ----------------------------------------------------------------- credentials

export interface ZohoCredentials {
  clientId: string;
  clientSecret: string;
  /** Accounts host for the data centre, e.g. https://accounts.zoho.com */
  accountsHost: string;
  /** API host for the data centre, e.g. https://www.zohoapis.com */
  apiDomain: string;
}

/**
 * Thrown when the Zoho client credentials are absent.
 *
 * A distinct type so a caller can tell "this deployment has no CRM connection"
 * apart from "the CRM connection is broken". The first is a configuration
 * state a health check should report calmly; the second is an incident.
 */
export class ZohoConfigError extends Error {
  readonly code = "ZOHO_NOT_CONFIGURED" as const;
  readonly retryable = false as const;

  constructor(message: string) {
    super(message);
    this.name = "ZohoConfigError";
  }
}

/** Failures of the OAuth exchange itself. */
export type ZohoAuthErrorCode =
  | "ZOHO_TOKEN_ROW_MISSING"
  | "ZOHO_REFRESH_FAILED"
  | "ZOHO_REFRESH_UNREACHABLE"
  | "ZOHO_REFRESH_LOCK_TIMEOUT";

export class ZohoAuthError extends Error {
  readonly code: ZohoAuthErrorCode;
  /**
   * Whether re-running later could succeed without a human.
   *
   * A refusal from the token endpoint is reported as retryable on purpose. The
   * usual causes — a revoked or rotated refresh token, a client secret that was
   * changed in the Zoho console — are fixed by an operator, and the sync
   * queue's backoff gives them hours to do it, after which queued work drains
   * on its own. Treating it as permanent would abandon real applications that
   * an operator would then have to find and replay by hand.
   */
  readonly retryable: boolean;

  constructor(code: ZohoAuthErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = "ZohoAuthError";
    this.code = code;
    this.retryable = retryable;
  }
}

/**
 * The data centre is .com, verified against the live CRM. Both hosts are
 * defaulted rather than required because they are not secrets and a wrong
 * value surfaces immediately as an auth failure; only the client credentials
 * genuinely have to come from the environment.
 */
const DEFAULT_ACCOUNTS_HOST = "https://accounts.zoho.com";
const DEFAULT_API_DOMAIN = "https://www.zohoapis.com";

function env(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : null;
}

/** Drop a trailing slash so `${host}/oauth/v2/token` never doubles up. */
function normaliseHost(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * True when this deployment has Zoho client credentials.
 *
 * Checked before doing any work, so a preview deployment or a local checkout
 * without credentials reports "not configured" instead of failing requests.
 */
export function isZohoConfigured(): boolean {
  return env("ZOHO_CLIENT_ID") !== null && env("ZOHO_CLIENT_SECRET") !== null;
}

export function readZohoCredentials(): ZohoCredentials {
  const clientId = env("ZOHO_CLIENT_ID");
  const clientSecret = env("ZOHO_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new ZohoConfigError(
      "Zoho CRM is not configured. Set ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET " +
        "(server-only, never NEXT_PUBLIC_). ZOHO_ACCOUNTS_HOST and ZOHO_API_DOMAIN " +
        "are optional and default to the .com data centre.",
    );
  }

  return {
    clientId,
    clientSecret,
    accountsHost: normaliseHost(env("ZOHO_ACCOUNTS_HOST") ?? DEFAULT_ACCOUNTS_HOST),
    apiDomain: normaliseHost(env("ZOHO_API_DOMAIN") ?? DEFAULT_API_DOMAIN),
  };
}

// ---------------------------------------------------------------- access tokens

export interface ZohoAccessToken {
  /**
   * Header value for `Authorization: Zoho-oauthtoken <token>`. Never log this,
   * never put it in an error message, never return it to a client.
   */
  token: string;
  /** Where API calls go. The stored row wins over the env, because Zoho's own grant response tells us. */
  apiDomain: string;
  expiresAt: Date;
}

export interface AccessTokenOptions {
  /**
   * A token value the caller has just seen rejected by the API. The refresh
   * path will not hand this value back, even if the database row still holds
   * it with time left on the clock — which happens when Zoho revokes a token
   * before its stated expiry.
   */
  rejectedToken?: string | null;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** Process-local cache. Lives as long as the serverless instance does. */
let cachedToken: ZohoAccessToken | null = null;

/** The in-flight refresh, if any. See the note at the top of this file. */
let refreshInFlight: Promise<ZohoAccessToken> | null = null;

function isUsable(token: ZohoAccessToken, rejected: string | null, now: number): boolean {
  if (rejected !== null && token.token === rejected) {
    return false;
  }
  return token.expiresAt.getTime() - REFRESH_SAFETY_MS > now;
}

/**
 * Return a usable access token, refreshing only when one is actually needed.
 *
 * Order of preference: the process cache, then the shared database row, then a
 * real refresh against Zoho. The middle step matters more than it looks: a
 * cold instance that reads a valid token out of Postgres costs one cheap HTTP
 * query and never touches the token endpoint or the connection pool.
 */
export async function getAccessToken(
  options: AccessTokenOptions = {},
): Promise<ZohoAccessToken> {
  const rejected = options.rejectedToken ?? null;

  if (cachedToken && isUsable(cachedToken, rejected, Date.now())) {
    return cachedToken;
  }

  if (!refreshInFlight) {
    refreshInFlight = acquireToken(rejected, false, options.fetchImpl).finally(() => {
      // Cleared whether it resolved or rejected: caching a rejection would
      // poison every later request on this instance.
      refreshInFlight = null;
    });
  }

  const token = await refreshInFlight;

  // A refresh already running when we learned the old token was rejected can
  // legitimately return that same value, because it short-circuited on a
  // database row Zoho had already revoked. One forced acquire settles it. This
  // cannot loop: the forced path skips every reuse branch and always talks to
  // Zoho.
  if (rejected !== null && token.token === rejected) {
    return acquireToken(rejected, true, options.fetchImpl);
  }

  return token;
}

/**
 * Drop the process-local cache so the next call re-reads or refreshes.
 *
 * Takes the rejected value and only clears when it still matches, so a 401
 * from a stale in-flight request cannot discard a token another caller has
 * already replaced it with.
 */
export function invalidateAccessToken(rejectedToken?: string | null): void {
  if (!rejectedToken || cachedToken?.token === rejectedToken) {
    cachedToken = null;
  }
}

interface TokenRow {
  refresh_token: string;
  access_token: string | null;
  access_expires_at: Date | null;
  api_domain: string | null;
}

async function readTokenRow(runner: Queryable): Promise<TokenRow> {
  const rows = await runner.query<TokenRow>(
    `SELECT refresh_token, access_token, access_expires_at, api_domain
       FROM zoho_oauth_tokens
      WHERE name = $1`,
    [ZOHO_TOKEN_NAME],
  );

  const row = rows[0];
  if (!row) {
    throw new ZohoAuthError(
      "ZOHO_TOKEN_ROW_MISSING",
      `No zoho_oauth_tokens row named '${ZOHO_TOKEN_NAME}'. The CRM connection has ` +
        "not been established, or was established against a different database.",
      // Retryable: the row is seeded by an operator, and backoff lets queued
      // work drain once they have done it.
      true,
    );
  }
  return row;
}

/** Build a token from the stored row, or null when the row has nothing usable. */
function tokenFromRow(
  row: TokenRow,
  fallbackApiDomain: string,
  rejected: string | null,
): ZohoAccessToken | null {
  if (!row.access_token || !row.access_expires_at) {
    return null;
  }

  const candidate: ZohoAccessToken = {
    token: row.access_token,
    apiDomain: normaliseHost(row.api_domain ?? fallbackApiDomain),
    expiresAt: row.access_expires_at,
  };

  return isUsable(candidate, rejected, Date.now()) ? candidate : null;
}

/**
 * The refresh itself.
 *
 * `forceRefresh` skips both reuse branches. It exists for the "Zoho rejected a
 * token that still looks valid everywhere we store it" case, which is the one
 * situation where reading the shared row again would just return the same dead
 * value.
 */
async function acquireToken(
  rejected: string | null,
  forceRefresh: boolean,
  fetchImpl: typeof fetch | undefined,
): Promise<ZohoAccessToken> {
  const credentials = readZohoCredentials();

  if (!forceRefresh) {
    // One HTTP query, no pooled connection, no advisory lock. This is the
    // common path for a cold instance and it must stay cheap.
    const row = await readTokenRow(db);
    const shared = tokenFromRow(row, credentials.apiDomain, rejected);
    if (shared) {
      cachedToken = shared;
      return shared;
    }
  }

  try {
    return await tx(async (t) => {
      // Bound the wait so a wedged holder cannot hang this request for the
      // whole function timeout. Literal, not a bind parameter: SET does not
      // take one, and the value is a constant in this file.
      await t.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

      // Transaction-scoped, so it is released at COMMIT or ROLLBACK and a
      // crashed worker cannot wedge the refresh for everyone else.
      await t.query("SELECT pg_advisory_xact_lock($1, $2)", [
        ZOHO_LOCK_CLASS,
        ZOHO_TOKEN_LOCK_KEY,
      ]);

      // Double-checked: whoever held the lock before us has very likely just
      // stored a fresh token, in which case we are done without calling Zoho.
      // This is what turns N concurrent instances into one refresh.
      const row = await readTokenRow(t);
      if (!forceRefresh) {
        const shared = tokenFromRow(row, credentials.apiDomain, rejected);
        if (shared) {
          cachedToken = shared;
          return shared;
        }
      }

      const refreshed = await requestAccessToken(
        credentials,
        row.refresh_token,
        fetchImpl ?? fetch,
      );

      // Persisted inside the same transaction that holds the lock, so the
      // token is visible to the next waiter the instant the lock is released.
      // refresh_token is never written here: Zoho's refresh grant does not
      // rotate it, and overwriting it with a blank would end the connection.
      await t.query(
        `UPDATE zoho_oauth_tokens
            SET access_token = $2,
                access_expires_at = $3,
                api_domain = COALESCE($4, api_domain)
          WHERE name = $1`,
        [ZOHO_TOKEN_NAME, refreshed.token, refreshed.expiresAt, refreshed.apiDomain],
      );

      cachedToken = refreshed;
      return refreshed;
    });
  } catch (error) {
    if (isPgError(error, LOCK_NOT_AVAILABLE)) {
      // Somebody else has been refreshing for longer than a healthy refresh
      // takes. Their result may still have landed, so look once before
      // failing; otherwise report it as retryable and let backoff handle it.
      const row = await readTokenRow(db).catch(() => null);
      const shared = row ? tokenFromRow(row, credentials.apiDomain, rejected) : null;
      if (shared) {
        cachedToken = shared;
        return shared;
      }
      throw new ZohoAuthError(
        "ZOHO_REFRESH_LOCK_TIMEOUT",
        `Timed out after ${LOCK_TIMEOUT} waiting for the Zoho token refresh lock.`,
        true,
      );
    }
    throw error;
  }
}

interface TokenGrantResponse {
  access_token?: string;
  expires_in?: number;
  api_domain?: string;
  error?: string;
}

/**
 * Exchange the refresh token for an access token.
 *
 * Nothing from the request or the response body is logged or attached to an
 * error beyond Zoho's short `error` code (values like `invalid_client`), which
 * carries no credential material. The body of a token response contains a live
 * token, so it must never reach a log line.
 */
async function requestAccessToken(
  credentials: ZohoCredentials,
  refreshToken: string,
  fetchImpl: typeof fetch,
): Promise<ZohoAccessToken> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: refreshToken,
  });

  let response: Response;
  try {
    response = await fetchImpl(`${credentials.accountsHost}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ZohoAuthError(
      "ZOHO_REFRESH_UNREACHABLE",
      "The Zoho token endpoint could not be reached.",
      true,
    );
  }

  const payload = (await response.json().catch(() => null)) as TokenGrantResponse | null;

  // Zoho answers this endpoint with HTTP 200 and an `error` key on failure, so
  // the status code alone is not a success signal.
  if (!payload?.access_token) {
    const reason = payload?.error ? `: ${payload.error}` : "";
    throw new ZohoAuthError(
      "ZOHO_REFRESH_FAILED",
      `Zoho refused the refresh-token grant (HTTP ${response.status}${reason}).`,
      true,
    );
  }

  const lifetimeSeconds =
    typeof payload.expires_in === "number" && payload.expires_in > 0
      ? payload.expires_in
      : DEFAULT_EXPIRES_IN_SECONDS;

  return {
    token: payload.access_token,
    apiDomain: normaliseHost(payload.api_domain ?? credentials.apiDomain),
    expiresAt: new Date(Date.now() + lifetimeSeconds * 1000),
  };
}
