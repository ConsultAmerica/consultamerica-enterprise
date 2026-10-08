/** Email normalization helpers (pure). */

export const MAX_NORMALIZED_CHARS = 20_000;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d{1,6});/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
}

/** HTML (or plain text) → readable plain text. Scripts/styles are dropped, never executed. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style|head|title)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|section|table)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const EMAIL = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function parseAddressList(raw: string): string[] {
  const decoded = decodeEntities(raw);
  return [...new Set((decoded.match(EMAIL) ?? []).map((e) => e.toLowerCase()))];
}

export function parseSingleAddress(raw: string): { address: string | null; name: string | null } {
  const decoded = decodeEntities(raw).trim();
  const address = decoded.match(EMAIL)?.[0]?.toLowerCase() ?? null;
  const name = decoded.replace(EMAIL, "").replace(/[<>"]/g, "").trim() || null;
  return { address, name };
}

/** Case-, whitespace- and punctuation-tolerant form used for evidence matching. */
export function canonical(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function capText(text: string, max = MAX_NORMALIZED_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}\n[…truncated]` : text;
}
