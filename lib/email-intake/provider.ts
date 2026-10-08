/**
 * Provider boundary for email intake. Recruiting code depends only on these
 * types; Zoho-specific DTOs stay inside lib/email-intake/zoho/.
 */

export type ProviderMessage = {
  providerMessageId: string;
  providerThreadId: string | null;
  folderId: string;
  /** ISO timestamp. */
  receivedAt: string;
  fromAddress: string | null;
  fromName: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string | null;
  hasAttachments: boolean;
};

export type ProviderAttachmentInfo = {
  providerAttachmentId: string;
  name: string;
  size: number;
};

export type EmailIntakeProvider = {
  readonly name: "zoho" | "mock";
  readonly accountId: string;
  readonly folderId: string;
  /** Newest first. `start` is 1-based, matching Zoho's paging. */
  listMessages(params: { start: number; limit: number }): Promise<ProviderMessage[]>;
  /** Message body (HTML or text). */
  getMessage(providerMessageId: string): Promise<string>;
  getThread(providerThreadId: string): Promise<ProviderMessage[]>;
  getAttachments(providerMessageId: string): Promise<ProviderAttachmentInfo[]>;
  downloadAttachment(providerMessageId: string, attachment: ProviderAttachmentInfo): Promise<Uint8Array>;
};

export type ProviderErrorKind = "auth" | "rate_limit" | "unavailable" | "not_found" | "invalid_response" | "config";

export class EmailProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly retryAfterSeconds?: number;

  constructor(kind: ProviderErrorKind, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "EmailProviderError";
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
