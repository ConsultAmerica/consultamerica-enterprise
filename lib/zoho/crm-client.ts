/**
 * Thin Zoho CRM v8 client: the three Contacts calls this integration needs.
 *
 * Two things about Zoho's API shape drive the whole design of this file.
 *
 * First, HTTP 200 does not mean the record was written. A write returns an
 * envelope with one status object per record, and a record can carry
 * `code: "MANDATORY_NOT_FOUND"` inside a perfectly successful HTTP response.
 * Anything that reads `response.ok` and moves on will report applications as
 * synced that Zoho never stored.
 *
 * Second, the failures split cleanly in two and must be handled differently:
 *
 *   * retryable — the environment is wrong. 429, 5xx, a dropped connection, a
 *     timeout, an expired or revoked token. The same payload will be accepted
 *     once the environment recovers, so the queue should back off and retry.
 *   * permanent — the payload is wrong. A missing mandatory field, a value a
 *     picklist does not accept, a field longer than its column. Re-sending the
 *     identical record in two minutes, then four, then eight, cannot change the
 *     answer, so eight attempts spread over eight hours is eight hours of
 *     pretending. These are abandoned immediately with the reason attached.
 *
 * An unrecognised error is treated as retryable. Getting that default wrong in
 * the other direction abandons real applications on an error code Zoho added
 * after this was written.
 */

import {
  getAccessToken,
  invalidateAccessToken,
  type ZohoAccessToken,
} from "@/lib/zoho/token";
import type { ZohoContactPayload } from "@/lib/zoho/field-map";

/** API version verified against the live CRM. */
export const ZOHO_API_VERSION = "v8";

const REQUEST_TIMEOUT_MS = 20_000;

/** Fallback when a 429 arrives without a usable Retry-After header. */
const DEFAULT_RETRY_AFTER_SECONDS = 60;

/** Clamp an absurd Retry-After so one bad header cannot park the queue for a day. */
const MAX_RETRY_AFTER_SECONDS = 900;

export type FetchLike = typeof fetch;

export interface ZohoClientOptions {
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: FetchLike;
}

// ----------------------------------------------------------------------- errors

export type ZohoErrorKind =
  /** Connection refused, DNS failure, socket closed. */
  | "NETWORK"
  /** Our own request timeout fired. */
  | "TIMEOUT"
  /** HTTP 429, or a TOO_MANY_REQUESTS record code. */
  | "RATE_LIMIT"
  /** HTTP 5xx, or an INTERNAL_ERROR record code. */
  | "SERVER"
  /** Token or scope problem: 401, 403, INVALID_TOKEN, NO_PERMISSION. */
  | "AUTH"
  /** The payload is wrong. Permanent. */
  | "VALIDATION"
  /** The record or module does not exist. */
  | "NOT_FOUND"
  /** A response this client does not know how to read. */
  | "UNEXPECTED";

export class ZohoApiError extends Error {
  readonly kind: ZohoErrorKind;
  /** False means abandon now; true means back off and try the same payload again. */
  readonly retryable: boolean;
  readonly httpStatus: number | null;
  /** Zoho's own code, from the record envelope or a top-level error body. */
  readonly zohoCode: string | null;
  /** Seconds to wait, read from Retry-After when Zoho supplies it. */
  readonly retryAfterSeconds: number | null;

  constructor(init: {
    kind: ZohoErrorKind;
    message: string;
    retryable: boolean;
    httpStatus?: number | null;
    zohoCode?: string | null;
    retryAfterSeconds?: number | null;
  }) {
    super(init.message);
    this.name = "ZohoApiError";
    this.kind = init.kind;
    this.retryable = init.retryable;
    this.httpStatus = init.httpStatus ?? null;
    this.zohoCode = init.zohoCode ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }
}

/**
 * Record-level codes that mean the payload will be rejected again no matter
 * when it is sent. Everything here is a data problem on our side.
 */
const PERMANENT_CODES = new Set([
  "MANDATORY_NOT_FOUND",
  "INVALID_DATA",
  "INVALID_URL_PATTERN",
  "INVALID_MODULE",
  "INVALID_REQUEST",
  "INVALID_QUERY",
  "REQUIRED_PARAM_MISSING",
  "REQUIRED_PARAM_INVALID",
  "LIMIT_EXCEEDED",
  "DUPLICATE_DATA",
  "NOT_APPROVED",
]);

/**
 * Record-level codes that are environmental.
 *
 * NO_PERMISSION and OAUTH_SCOPE_MISMATCH sit here rather than with the
 * permanent codes on purpose. They are operator-fixable — grant the scope,
 * reconnect — and the queue's backoff gives an operator hours to do it, after
 * which the work drains by itself. Abandoning would mean somebody has to find
 * and replay every application that happened to land during the gap.
 */
const RETRYABLE_CODES = new Set([
  "INTERNAL_ERROR",
  "TOO_MANY_REQUESTS",
  "INVALID_TOKEN",
  "AUTHENTICATION_FAILURE",
  "NO_PERMISSION",
  "OAUTH_SCOPE_MISMATCH",
  "RECORD_LOCKED",
  "RECORD_IN_BLUEPRINT",
]);

function kindForCode(code: string): ZohoErrorKind {
  if (code === "TOO_MANY_REQUESTS") return "RATE_LIMIT";
  if (code === "INTERNAL_ERROR") return "SERVER";
  if (
    code === "INVALID_TOKEN" ||
    code === "AUTHENTICATION_FAILURE" ||
    code === "NO_PERMISSION" ||
    code === "OAUTH_SCOPE_MISMATCH"
  ) {
    return "AUTH";
  }
  if (PERMANENT_CODES.has(code)) return "VALIDATION";
  return "UNEXPECTED";
}

function isRetryableCode(code: string): boolean {
  if (PERMANENT_CODES.has(code)) return false;
  if (RETRYABLE_CODES.has(code)) return true;
  // Unknown code: see the note at the top of this file.
  return true;
}

// ------------------------------------------------------------------- public API

export interface ZohoContactRecord {
  id: string;
  [field: string]: unknown;
}

export interface ZohoUpsertResult {
  /** The Zoho record id, stored on the queue row and on the candidate. */
  id: string;
  /** Whether Zoho created the contact or matched an existing one. */
  action: "insert" | "update" | "unknown";
  /** The field Zoho matched on, when it updated rather than inserted. */
  duplicateField: string | null;
}

/**
 * Create or update a contact, matched on Email.
 *
 * `duplicate_check_fields: ["Email"]` is what makes re-applying safe: the same
 * person applying to a second role updates one contact instead of accumulating
 * a row per application for a recruiter to reconcile by hand. It is also why
 * lib/zoho/field-map.ts refuses to build a payload with no email.
 */
export async function upsertContact(
  payload: ZohoContactPayload,
  options: ZohoClientOptions = {},
): Promise<ZohoUpsertResult> {
  const response = await request(
    {
      method: "POST",
      path: "/Contacts/upsert",
      body: { data: [payload], duplicate_check_fields: ["Email"] },
    },
    options,
  );

  const body = await readJson(response);
  const record = firstRecord(body);

  if (!record) {
    throw new ZohoApiError({
      kind: "UNEXPECTED",
      message: `Zoho returned HTTP ${response.status} with no record envelope for the upsert.`,
      retryable: true,
      httpStatus: response.status,
    });
  }

  const code = typeof record.code === "string" ? record.code : "";

  // The crux: a 200 with a non-SUCCESS record code is a failed write.
  if (code !== "SUCCESS") {
    throw new ZohoApiError({
      kind: kindForCode(code),
      message: describeRecordFailure(record, code, response.status),
      retryable: isRetryableCode(code),
      httpStatus: response.status,
      zohoCode: code || null,
      retryAfterSeconds: retryAfterFrom(response),
    });
  }

  const details =
    typeof record.details === "object" && record.details !== null
      ? (record.details as Record<string, unknown>)
      : {};
  const id = typeof details.id === "string" ? details.id : null;

  if (!id) {
    // A SUCCESS with no id cannot be recorded against the candidate, and
    // reporting the job as done would lose the link permanently. Retry instead;
    // the upsert is idempotent, so a second call returns the same contact.
    throw new ZohoApiError({
      kind: "UNEXPECTED",
      message: "Zoho reported SUCCESS for the upsert but returned no record id.",
      retryable: true,
      httpStatus: response.status,
      zohoCode: code,
    });
  }

  const action = typeof record.action === "string" ? record.action : "";

  return {
    id,
    action: action === "insert" || action === "update" ? action : "unknown",
    duplicateField:
      typeof record.duplicate_field === "string" ? record.duplicate_field : null,
  };
}

/** Read one contact by id. Null when it does not exist (or was deleted). */
export async function getContact(
  id: string,
  options: ZohoClientOptions = {},
): Promise<ZohoContactRecord | null> {
  const trimmed = id.trim();
  if (trimmed === "") {
    return null;
  }

  const response = await request(
    { method: "GET", path: `/Contacts/${encodeURIComponent(trimmed)}`, allow404: true },
    options,
  );

  // 204 is Zoho's "nothing to return", not an error.
  if (response.status === 204 || response.status === 404) {
    return null;
  }

  return firstContact(await readJson(response));
}

/**
 * Find a contact by email address.
 *
 * Not used by the write path — the upsert's duplicate check does that work
 * server-side in one call — but the admin side needs it to answer "is this
 * person already in the CRM, and under which record" without a write.
 */
export async function searchContactByEmail(
  email: string,
  options: ZohoClientOptions = {},
): Promise<ZohoContactRecord | null> {
  const trimmed = email.trim();
  if (trimmed === "") {
    return null;
  }

  const response = await request(
    {
      method: "GET",
      path: `/Contacts/search?email=${encodeURIComponent(trimmed)}`,
      allow404: true,
    },
    options,
  );

  if (response.status === 204 || response.status === 404) {
    return null;
  }

  return firstContact(await readJson(response));
}

// ------------------------------------------------------------------- transport

interface RequestSpec {
  method: "GET" | "POST";
  /** Path below /crm/{version}, starting with a slash. */
  path: string;
  body?: unknown;
  /** When true, a 404 is returned to the caller instead of thrown. */
  allow404?: boolean;
}

/**
 * One API call, with a single inline retry for an expired token.
 *
 * The 401 retry is inline rather than left to the queue because it is the one
 * failure that is genuinely momentary: the access token aged out between being
 * read and being used. Forcing a fresh token and repeating the call turns a
 * guaranteed failure into a success inside the same invocation. It is done once
 * — a second 401 means the credentials themselves are wrong, which no amount of
 * immediate repetition fixes, so that is handed to the queue's backoff.
 */
async function request(
  spec: RequestSpec,
  options: ZohoClientOptions,
  rejectedToken: string | null = null,
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;

  // A token failure propagates unwrapped: ZohoAuthError and ZohoConfigError
  // both carry their own `retryable` flag and their own message, which the sync
  // worker reads directly. Wrapping them would only bury the reason.
  const token: ZohoAccessToken = await getAccessToken({ rejectedToken, fetchImpl });

  const url = `${token.apiDomain}/crm/${ZOHO_API_VERSION}${spec.path}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: spec.method,
      headers: {
        // Zoho uses its own scheme here, not Bearer.
        Authorization: `Zoho-oauthtoken ${token.token}`,
        Accept: "application/json",
        ...(spec.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // The URL is safe to name; headers and body are not, because the header
    // carries a live access token.
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new ZohoApiError({
      kind: timedOut ? "TIMEOUT" : "NETWORK",
      message: timedOut
        ? `Zoho CRM did not respond within ${REQUEST_TIMEOUT_MS}ms (${spec.method} ${spec.path}).`
        : `Zoho CRM is unreachable (${spec.method} ${spec.path}).`,
      retryable: true,
    });
  }

  if (response.status === 401 && rejectedToken === null) {
    invalidateAccessToken(token.token);
    return request(spec, options, token.token);
  }

  if (response.ok) {
    return response;
  }

  if (response.status === 404 && spec.allow404) {
    return response;
  }

  throw await classifyHttpFailure(response, spec);
}

/**
 * Turn a non-2xx response into a classified error.
 *
 * Zoho's own code in the body is more precise than the status, so it wins when
 * present; the status is the fallback.
 */
async function classifyHttpFailure(
  response: Response,
  spec: RequestSpec,
): Promise<ZohoApiError> {
  const body = await response
    .json()
    .catch(() => null) as Record<string, unknown> | null;

  const bodyCode = typeof body?.code === "string" ? body.code : null;
  const bodyMessage = typeof body?.message === "string" ? body.message : null;
  const where = `${spec.method} ${spec.path}`;
  const retryAfterSeconds = retryAfterFrom(response);

  if (bodyCode) {
    return new ZohoApiError({
      kind: kindForCode(bodyCode),
      message: `Zoho CRM rejected ${where}: ${bodyCode}${
        bodyMessage ? ` — ${bodyMessage}` : ""
      } (HTTP ${response.status}).`,
      retryable: isRetryableCode(bodyCode),
      httpStatus: response.status,
      zohoCode: bodyCode,
      retryAfterSeconds,
    });
  }

  const status = response.status;

  if (status === 429) {
    return new ZohoApiError({
      kind: "RATE_LIMIT",
      message: `Zoho CRM rate limit hit on ${where}.`,
      retryable: true,
      httpStatus: status,
      retryAfterSeconds: retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS,
    });
  }

  if (status >= 500) {
    return new ZohoApiError({
      kind: "SERVER",
      message: `Zoho CRM returned HTTP ${status} on ${where}.`,
      retryable: true,
      httpStatus: status,
      retryAfterSeconds,
    });
  }

  if (status === 401 || status === 403) {
    // Reached only after the inline retry already failed, or on a 403.
    return new ZohoApiError({
      kind: "AUTH",
      message:
        `Zoho CRM refused the credentials on ${where} (HTTP ${status}). The refresh ` +
        "token may have been revoked, or the granted scopes may no longer cover " +
        "Contacts writes.",
      retryable: true,
      httpStatus: status,
    });
  }

  if (status === 404) {
    return new ZohoApiError({
      kind: "NOT_FOUND",
      message: `Zoho CRM has no such resource for ${where} (HTTP 404).`,
      retryable: false,
      httpStatus: status,
    });
  }

  if (status === 408 || status === 409) {
    return new ZohoApiError({
      kind: "SERVER",
      message: `Zoho CRM returned HTTP ${status} on ${where}.`,
      retryable: true,
      httpStatus: status,
      retryAfterSeconds,
    });
  }

  if (status >= 400) {
    // 400, 405, 413, 415, 422: the request itself is wrong.
    return new ZohoApiError({
      kind: "VALIDATION",
      message: `Zoho CRM rejected ${where} as invalid (HTTP ${status})${
        bodyMessage ? `: ${bodyMessage}` : ""
      }.`,
      retryable: false,
      httpStatus: status,
    });
  }

  return new ZohoApiError({
    kind: "UNEXPECTED",
    message: `Zoho CRM returned an unexpected HTTP ${status} on ${where}.`,
    retryable: true,
    httpStatus: status,
  });
}

/**
 * Read Retry-After, which is either a count of seconds or an HTTP date.
 *
 * Honouring it is the difference between backing off and being blocked: Zoho
 * counts credits per minute and per day, and a client that keeps knocking
 * during the penalty extends it.
 */
function retryAfterFrom(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) {
    return null;
  }

  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.ceil(seconds), MAX_RETRY_AFTER_SECONDS);
  }

  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    const delta = Math.ceil((date - Date.now()) / 1000);
    return delta > 0 ? Math.min(delta, MAX_RETRY_AFTER_SECONDS) : 0;
  }

  return null;
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  if (response.status === 204) {
    return null;
  }
  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}

function firstRecord(
  body: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const data = body?.data;
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  const first = data[0];
  return typeof first === "object" && first !== null
    ? (first as Record<string, unknown>)
    : null;
}

function firstContact(body: Record<string, unknown> | null): ZohoContactRecord | null {
  const record = firstRecord(body);
  if (!record || typeof record.id !== "string") {
    return null;
  }
  return record as ZohoContactRecord;
}

/**
 * Describe a failed record, including the field Zoho named.
 *
 * `details.api_name` is the single most useful thing in the envelope — it is
 * the difference between "Zoho rejected this" and "Hiring_Status rejected
 * ARCHIVED" — and it is safe to log because it is a field name, not a value.
 */
function describeRecordFailure(
  record: Record<string, unknown>,
  code: string,
  httpStatus: number,
): string {
  const message = typeof record.message === "string" ? record.message : null;
  const details =
    typeof record.details === "object" && record.details !== null
      ? (record.details as Record<string, unknown>)
      : {};
  const apiName = typeof details.api_name === "string" ? details.api_name : null;

  const parts = [`Zoho rejected the Contacts upsert with ${code || "no code"}`];
  if (apiName) {
    parts.push(`on field ${apiName}`);
  }
  if (message) {
    parts.push(`(${message})`);
  }
  parts.push(`[HTTP ${httpStatus}]`);
  return parts.join(" ");
}
