import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/** Public careers assistant: fast and inexpensive per visitor message. */
export const ASSISTANT_MODEL = "claude-haiku-4-5";

/** Private email classification / job extraction, where accuracy matters more than cost. */
export const EXTRACTION_MODEL = "claude-sonnet-5-5";

let cached: Anthropic | null | undefined;

/**
 * Server-only Anthropic client. Returns null when ANTHROPIC_API_KEY is unset so
 * callers can degrade to a safe, non-AI response instead of throwing.
 */
export function getClaudeClient(): Anthropic | null {
  if (cached !== undefined) return cached;
  cached = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ timeout: 30_000, maxRetries: 1 })
    : null;
  return cached;
}

/** Narrow seam so the assistant and intake pipelines can be tested without network calls. */
export type ClaudeMessages = {
  create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
};

export function claudeMessages(client: Anthropic): ClaudeMessages {
  return { create: (params) => client.messages.create(params) };
}
