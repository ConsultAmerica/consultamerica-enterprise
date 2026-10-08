/**
 * Minimal Zoho Mail REST client (server-side OAuth, refresh-token grant).
 * Docs: https://www.zoho.com/mail/help/api/using-oauth-2.html
 * Access tokens last one hour; the Authorization header is
 * `Zoho-oauthtoken <token>` (not Bearer). Secrets never leave this module.
 */

import { EmailProviderError } from "@/lib/email-intake/provider";
import type { ZohoConfig } from "@/lib/email-intake/config";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const TOKEN_SAFETY_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

export class ZohoMailClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: ZohoConfig,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async refreshAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      refresh_token: this.config.refreshToken,
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.config.accountsUrl}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new EmailProviderError("unavailable", "Zoho token endpoint unreachable");
    }
    const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
    if (!res.ok || !data?.access_token) {
      // Never include the response body: it can echo credentials.
      throw new EmailProviderError("auth", `Zoho token refresh failed (${res.status}${data?.error ? `: ${data.error}` : ""})`);
    }
    this.token = {
      value: data.access_token,
      expiresAt: this.now() + (data.expires_in ?? 3600) * 1000 - TOKEN_SAFETY_MS,
    };
    return this.token.value;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now()) return this.token.value;
    return this.refreshAccessToken();
  }

  private async request(path: string, accept: "json" | "binary", retried = false): Promise<Response> {
    const token = await this.accessToken();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.config.mailApiUrl}${path}`, {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          Accept: accept === "json" ? "application/json" : "application/octet-stream",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new EmailProviderError("unavailable", "Zoho Mail API unreachable");
    }
    if (res.status === 401 && !retried) {
      this.token = null;
      return this.request(path, accept, true);
    }
    if (res.status === 401 || res.status === 403) throw new EmailProviderError("auth", `Zoho Mail rejected credentials (${res.status})`);
    if (res.status === 404) throw new EmailProviderError("not_found", "Zoho Mail resource not found");
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "");
      throw new EmailProviderError("rate_limit", "Zoho Mail rate limit", Number.isFinite(retryAfter) ? retryAfter : 60);
    }
    if (res.status >= 500) throw new EmailProviderError("unavailable", `Zoho Mail unavailable (${res.status})`);
    if (!res.ok) throw new EmailProviderError("invalid_response", `Zoho Mail request failed (${res.status})`);
    return res;
  }

  async getJson<T>(path: string): Promise<T> {
    const res = await this.request(path, "json");
    const payload = (await res.json().catch(() => null)) as { status?: { code?: number }; data?: T } | null;
    if (!payload || payload.data === undefined) throw new EmailProviderError("invalid_response", "Zoho Mail returned no data");
    return payload.data;
  }

  async getBinary(path: string, maxBytes: number): Promise<Uint8Array> {
    const res = await this.request(path, "binary");
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) throw new EmailProviderError("invalid_response", "Attachment exceeds size limit");
    const buffer = new Uint8Array(await res.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new EmailProviderError("invalid_response", "Attachment exceeds size limit");
    return buffer;
  }
}
