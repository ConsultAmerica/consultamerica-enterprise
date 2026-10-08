/**
 * Zoho Mail implementation of EmailIntakeProvider. Endpoints (Zoho Mail API):
 *   GET /api/accounts/{accountId}/messages/view?folderId&start&limit&sortBy=date&sortorder=false
 *   GET /api/accounts/{accountId}/folders/{folderId}/messages/{messageId}/content
 *   GET /api/accounts/{accountId}/folders/{folderId}/messages/{messageId}/attachmentinfo
 *   GET /api/accounts/{accountId}/folders/{folderId}/messages/{messageId}/attachments/{attachmentId}
 * Scopes: ZohoMail.messages.READ (+ ZohoMail.accounts.READ / ZohoMail.folders.READ for setup).
 */

import type { ZohoConfig } from "@/lib/email-intake/config";
import { parseAddressList, parseSingleAddress } from "@/lib/email-intake/normalize";
import {
  EmailProviderError,
  type EmailIntakeProvider,
  type ProviderAttachmentInfo,
  type ProviderMessage,
} from "@/lib/email-intake/provider";
import { ZohoMailClient } from "@/lib/email-intake/zoho/client";
import { MAX_EXTRACTION_BYTES } from "@/lib/documents/text-extraction";

/** Zoho list-view message DTO (fields we read; ids arrive as strings or numbers). */
type ZohoMessageDto = {
  messageId: string | number;
  threadId?: string | number | null;
  folderId: string | number;
  receivedTime: string | number;
  fromAddress?: string;
  sender?: string;
  toAddress?: string;
  ccAddress?: string;
  subject?: string;
  hasAttachment?: string | boolean | number;
};

type ZohoAttachmentInfoDto = {
  attachments?: { attachmentId: string | number; attachmentName: string; attachmentSize: number | string }[];
};

const id = (value: string | number | null | undefined): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

export function mapZohoMessage(dto: ZohoMessageDto): ProviderMessage {
  const messageId = id(dto.messageId);
  const received = Number(dto.receivedTime);
  if (!messageId || !Number.isFinite(received)) {
    throw new EmailProviderError("invalid_response", "Zoho message missing id or receivedTime");
  }
  const from = parseSingleAddress(dto.fromAddress ?? "");
  return {
    providerMessageId: messageId,
    providerThreadId: id(dto.threadId),
    folderId: String(dto.folderId),
    receivedAt: new Date(received).toISOString(),
    fromAddress: from.address,
    fromName: dto.sender?.trim() || from.name,
    toAddresses: parseAddressList(dto.toAddress ?? ""),
    ccAddresses: parseAddressList(dto.ccAddress ?? ""),
    subject: dto.subject?.trim() || null,
    hasAttachments: dto.hasAttachment === true || dto.hasAttachment === 1 || dto.hasAttachment === "1",
  };
}

export function createZohoProvider(config: ZohoConfig, client = new ZohoMailClient(config)): EmailIntakeProvider {
  const account = encodeURIComponent(config.accountId);
  const folder = encodeURIComponent(config.folderId);
  const messagePath = (messageId: string) => `/api/accounts/${account}/folders/${folder}/messages/${encodeURIComponent(messageId)}`;

  return {
    name: "zoho",
    accountId: config.accountId,
    folderId: config.folderId,

    async listMessages({ start, limit }) {
      const query = new URLSearchParams({
        folderId: config.folderId,
        start: String(start),
        limit: String(Math.min(200, Math.max(1, limit))),
        sortBy: "date",
        sortorder: "false",
        includeto: "true",
      });
      const data = await client.getJson<ZohoMessageDto[]>(`/api/accounts/${account}/messages/view?${query}`);
      if (!Array.isArray(data)) throw new EmailProviderError("invalid_response", "Zoho message list is not an array");
      return data.map(mapZohoMessage);
    },

    async getMessage(messageId) {
      const data = await client.getJson<{ content?: string }>(`${messagePath(messageId)}/content`);
      return typeof data.content === "string" ? data.content : "";
    },

    async getThread(threadId) {
      const query = new URLSearchParams({ folderId: config.folderId, threadId, limit: "50", includeto: "true" });
      const data = await client.getJson<ZohoMessageDto[]>(`/api/accounts/${account}/messages/view?${query}`);
      return Array.isArray(data) ? data.map(mapZohoMessage) : [];
    },

    async getAttachments(messageId) {
      const data = await client.getJson<ZohoAttachmentInfoDto>(`${messagePath(messageId)}/attachmentinfo`);
      return (data.attachments ?? []).map(
        (a): ProviderAttachmentInfo => ({
          providerAttachmentId: String(a.attachmentId),
          name: a.attachmentName,
          size: Number(a.attachmentSize) || 0,
        }),
      );
    },

    async downloadAttachment(messageId, attachment) {
      if (attachment.size > MAX_EXTRACTION_BYTES) {
        throw new EmailProviderError("invalid_response", "Attachment exceeds size limit");
      }
      return client.getBinary(
        `${messagePath(messageId)}/attachments/${encodeURIComponent(attachment.providerAttachmentId)}`,
        MAX_EXTRACTION_BYTES,
      );
    },
  };
}
