import { describe, expect, it } from "vitest";

import { IntakeConfigError, isAllowedSender, readIntakeConfig } from "@/lib/email-intake/config";
import { EmailProviderError } from "@/lib/email-intake/provider";
import { ZohoMailClient } from "@/lib/email-intake/zoho/client";
import { createZohoProvider, mapZohoMessage } from "@/lib/email-intake/zoho/provider";

const config = {
  clientId: "cid",
  clientSecret: "secret",
  refreshToken: "refresh",
  accountsUrl: "https://accounts.zoho.com",
  mailApiUrl: "https://mail.zoho.com",
  accountId: "123",
  folderId: "456",
};

type Call = { url: string; init?: RequestInit };

function fakeFetch(routes: (call: Call, n: number) => Response) {
  const calls: Call[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return routes({ url, init }, calls.length);
  };
  return { fn, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("Zoho Mail provider", () => {
  it("refreshes an OAuth token and sends it as Zoho-oauthtoken (not Bearer)", async () => {
    const { fn, calls } = fakeFetch(({ url }) =>
      url.includes("/oauth/v2/token")
        ? json({ access_token: "tok-1", expires_in: 3600 })
        : json({ status: { code: 200 }, data: [{ messageId: 1, threadId: 9, folderId: 456, receivedTime: "1791400000000", fromAddress: "&lt;hr@client.example&gt;", sender: "Client HR", toAddress: "jobs@ca.example", subject: "Need a developer", hasAttachment: "1" }] }),
    );
    const provider = createZohoProvider(config, new ZohoMailClient(config, fn));
    const list = await provider.listMessages({ start: 1, limit: 50 });
    expect(calls[0].url).toBe("https://accounts.zoho.com/oauth/v2/token");
    expect(String(calls[0].init?.body)).toContain("grant_type=refresh_token");
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe("Zoho-oauthtoken tok-1");
    expect(calls[1].url).toContain("/api/accounts/123/messages/view?folderId=456");
    expect(list[0]).toMatchObject({ providerMessageId: "1", providerThreadId: "9", fromAddress: "hr@client.example", fromName: "Client HR", hasAttachments: true });
  });

  it("retries once with a fresh token after a 401", async () => {
    let tokens = 0;
    const { fn } = fakeFetch(({ url }, n) => {
      if (url.includes("/oauth/v2/token")) return json({ access_token: `tok-${++tokens}`, expires_in: 3600 });
      return n === 2 ? json({}, 401) : json({ data: { content: "<p>hi</p>" } });
    });
    const provider = createZohoProvider(config, new ZohoMailClient(config, fn));
    await expect(provider.getMessage("1")).resolves.toBe("<p>hi</p>");
    expect(tokens).toBe(2);
  });

  it("maps 429 to a rate_limit error with retry-after, and 5xx to unavailable", async () => {
    const rate = createZohoProvider(config, new ZohoMailClient(config, (async (url: string) => (url.includes("token") ? json({ access_token: "t" }) : json({}, 429, { "retry-after": "120" }))) as never));
    await expect(rate.getMessage("1")).rejects.toMatchObject({ kind: "rate_limit", retryAfterSeconds: 120 });
    const down = createZohoProvider(config, new ZohoMailClient(config, (async (url: string) => (url.includes("token") ? json({ access_token: "t" }) : json({}, 503))) as never));
    await expect(down.getMessage("1")).rejects.toBeInstanceOf(EmailProviderError);
  });

  it("never includes the token response body in errors", async () => {
    const client = new ZohoMailClient(config, (async () => json({ error: "invalid_code", refresh_token: "leaked" }, 400)) as never);
    const error = await createZohoProvider(config, client).getMessage("1").catch((e: Error) => e);
    expect(String(error)).not.toContain("leaked");
    expect((error as EmailProviderError).kind).toBe("auth");
  });

  it("rejects malformed list entries", () => {
    expect(() => mapZohoMessage({ messageId: "", folderId: 1, receivedTime: "x" })).toThrow(EmailProviderError);
  });
});

describe("intake configuration", () => {
  const zohoEnv = {
    NODE_ENV: "test",
    EMAIL_INTAKE_MODE: "zoho",
    EMAIL_INTAKE_INITIAL_SYNC_AFTER: "2026-10-01T00:00:00Z",
    ZOHO_CLIENT_ID: "a",
    ZOHO_CLIENT_SECRET: "b",
    ZOHO_REFRESH_TOKEN: "c",
    ZOHO_ACCOUNTS_URL: "https://accounts.zoho.eu",
    ZOHO_MAIL_API_URL: "https://mail.zoho.eu",
    ZOHO_MAIL_ACCOUNT_ID: "1",
    ZOHO_MAIL_FOLDER_ID: "2",
  } as NodeJS.ProcessEnv;

  it("accepts a complete server-side Zoho configuration", () => {
    expect(readIntakeConfig(zohoEnv).zoho?.mailApiUrl).toBe("https://mail.zoho.eu");
  });

  it("rejects non-Zoho hosts (no credential exfiltration via misconfiguration)", () => {
    expect(() => readIntakeConfig({ ...zohoEnv, ZOHO_ACCOUNTS_URL: "https://evil.example" })).toThrow(IntakeConfigError);
    expect(() => readIntakeConfig({ ...zohoEnv, ZOHO_MAIL_API_URL: "http://mail.zoho.com" })).toThrow(IntakeConfigError);
  });

  it("requires an explicit initial sync date for Zoho mode", () => {
    expect(() => readIntakeConfig({ ...zohoEnv, EMAIL_INTAKE_INITIAL_SYNC_AFTER: "" })).toThrow(IntakeConfigError);
  });

  it("refuses mock mode in production", () => {
    expect(() => readIntakeConfig({ NODE_ENV: "production", EMAIL_INTAKE_MODE: "mock" } as NodeJS.ProcessEnv)).toThrow(IntakeConfigError);
  });

  it("matches the sender allowlist by address or @domain", () => {
    expect(isAllowedSender("A@Client.example", ["@client.example"])).toBe(true);
    expect(isAllowedSender("a@other.example", ["@client.example", "b@x.example"])).toBe(false);
    expect(isAllowedSender(null, ["@client.example"])).toBe(false);
    expect(isAllowedSender("anyone@x.example", [])).toBe(true);
  });
});
