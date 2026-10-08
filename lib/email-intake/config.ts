/**
 * Email intake configuration (server-only values; none are NEXT_PUBLIC_).
 *
 *   EMAIL_INTAKE_MODE              off (default) | mock (non-production only) | zoho
 *   EMAIL_INTAKE_INITIAL_SYNC_AFTER ISO date — mail received earlier is never ingested
 *   EMAIL_INTAKE_ALLOWED_SENDERS   optional comma list of addresses and/or @domains
 *   ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN   Zoho OAuth (server-based client)
 *   ZOHO_ACCOUNTS_URL              e.g. https://accounts.zoho.com (data-center specific)
 *   ZOHO_MAIL_API_URL              e.g. https://mail.zoho.com (data-center specific)
 *   ZOHO_MAIL_ACCOUNT_ID           Zoho Mail account id of the intake mailbox
 *   ZOHO_MAIL_FOLDER_ID            folder to ingest (e.g. "Recruiting / Job Requirements")
 */

export type IntakeMode = "off" | "mock" | "zoho";

export type ZohoConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accountsUrl: string;
  mailApiUrl: string;
  accountId: string;
  folderId: string;
};

export type IntakeConfig = {
  mode: IntakeMode;
  initialSyncAfter: Date;
  allowedSenders: string[];
  zoho: ZohoConfig | null;
};

export class IntakeConfigError extends Error {}

const ZOHO_ACCOUNTS_HOST = /^accounts\.zoho(cloud)?\.(com|eu|in|com\.au|jp|ca|sa|uk|com\.cn)$/;
const ZOHO_MAIL_HOST = /^mail\.zoho(cloud)?\.(com|eu|in|com\.au|jp|ca|sa|uk|com\.cn)$/;

function zohoUrl(value: string | undefined, pattern: RegExp, name: string): string {
  if (!value) throw new IntakeConfigError(`${name} is required`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IntakeConfigError(`${name} is not a valid URL`);
  }
  if (url.protocol !== "https:" || !pattern.test(url.hostname)) {
    throw new IntakeConfigError(`${name} must be an https Zoho data-center host`);
  }
  return url.origin;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new IntakeConfigError(`${name} is required`);
  return value;
}

export function readIntakeConfig(env: NodeJS.ProcessEnv = process.env): IntakeConfig {
  const raw = (env.EMAIL_INTAKE_MODE ?? "off").trim().toLowerCase();
  const mode: IntakeMode = raw === "zoho" || raw === "mock" ? raw : "off";
  if (mode === "mock" && env.NODE_ENV === "production") {
    throw new IntakeConfigError("EMAIL_INTAKE_MODE=mock is not allowed in production");
  }

  const allowedSenders = (env.EMAIL_INTAKE_ALLOWED_SENDERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (mode !== "zoho") {
    return {
      mode,
      initialSyncAfter: new Date(env.EMAIL_INTAKE_INITIAL_SYNC_AFTER || "2026-10-01T00:00:00Z"),
      allowedSenders,
      zoho: null,
    };
  }

  const startRaw = required(env, "EMAIL_INTAKE_INITIAL_SYNC_AFTER");
  const initialSyncAfter = new Date(startRaw);
  if (Number.isNaN(initialSyncAfter.getTime())) {
    throw new IntakeConfigError("EMAIL_INTAKE_INITIAL_SYNC_AFTER must be an ISO date");
  }

  return {
    mode,
    initialSyncAfter,
    allowedSenders,
    zoho: {
      clientId: required(env, "ZOHO_CLIENT_ID"),
      clientSecret: required(env, "ZOHO_CLIENT_SECRET"),
      refreshToken: required(env, "ZOHO_REFRESH_TOKEN"),
      accountsUrl: zohoUrl(env.ZOHO_ACCOUNTS_URL, ZOHO_ACCOUNTS_HOST, "ZOHO_ACCOUNTS_URL"),
      mailApiUrl: zohoUrl(env.ZOHO_MAIL_API_URL, ZOHO_MAIL_HOST, "ZOHO_MAIL_API_URL"),
      accountId: required(env, "ZOHO_MAIL_ACCOUNT_ID"),
      folderId: required(env, "ZOHO_MAIL_FOLDER_ID"),
    },
  };
}

/** Sender allowlist: exact addresses or "@domain" entries. Empty list allows all senders in the folder. */
export function isAllowedSender(address: string | null, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  if (!address) return false;
  const email = address.trim().toLowerCase();
  const domain = email.slice(email.lastIndexOf("@"));
  return allowed.some((entry) => (entry.startsWith("@") ? entry === domain : entry === email));
}
