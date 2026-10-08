/**
 * Plain-text extraction for resumes and emailed job requirements (PDF, DOCX,
 * DOC, TXT). Ported from consultamerica-functional-source
 * lib/recruiting/jd-extraction.ts and extended with legacy .doc support.
 *
 * Safety: the file's leading bytes must match its extension, macro-enabled
 * Word files are rejected, and only text is read — no macros, scripts or
 * embedded objects are executed or followed.
 */

export const MAX_EXTRACTION_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_CHARS = 60_000;

export type ExtractableKind = "pdf" | "docx" | "doc" | "txt";

export type TextExtractionResult =
  | { ok: true; kind: ExtractableKind; text: string; truncated: boolean }
  | { ok: false; reason: "empty" | "too_large" | "unsupported_type" | "type_mismatch" | "macro_enabled" | "no_text" | "unreadable" };

function kindFromName(fileName: string): ExtractableKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".doc")) return "doc";
  if (lower.endsWith(".txt")) return "txt";
  return null;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((b, i) => bytes[i] === b);
}

function containsAscii(bytes: Uint8Array, needle: string): boolean {
  const target = Buffer.from(needle, "latin1");
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(target);
}

/** Leading-byte check so a renamed executable or archive is not parsed as a document. */
function signatureMatches(kind: ExtractableKind, bytes: Uint8Array): boolean {
  switch (kind) {
    case "pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case "docx":
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]); // ZIP (OOXML)
    case "doc":
      return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // OLE2
    case "txt":
      return !bytes.subarray(0, 4096).includes(0); // no NUL bytes in a text file
  }
}

function clean(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractDocumentText(input: {
  fileName: string;
  bytes: Uint8Array | ArrayBuffer;
}): Promise<TextExtractionResult> {
  const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" };
  if (bytes.byteLength > MAX_EXTRACTION_BYTES) return { ok: false, reason: "too_large" };

  const lower = input.fileName.toLowerCase();
  if (/\.(docm|dotm|xlsm|pptm)$/.test(lower)) return { ok: false, reason: "macro_enabled" };
  const kind = kindFromName(input.fileName);
  if (!kind) return { ok: false, reason: "unsupported_type" };
  if (!signatureMatches(kind, bytes)) return { ok: false, reason: "type_mismatch" };
  if (kind === "docx" && containsAscii(bytes, "vbaProject.bin")) return { ok: false, reason: "macro_enabled" };

  let text: string;
  try {
    if (kind === "txt") {
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } else if (kind === "pdf") {
      const { extractText } = await import("unpdf");
      const result = await extractText(new Uint8Array(bytes), { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    } else if (kind === "docx") {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = value;
    } else {
      const { default: WordExtractor } = await import("word-extractor");
      const doc = await new WordExtractor().extract(Buffer.from(bytes));
      text = doc.getBody();
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  const cleaned = clean(text);
  if (!cleaned) return { ok: false, reason: "no_text" };
  const truncated = cleaned.length > MAX_EXTRACTED_CHARS;
  return { ok: true, kind, text: truncated ? cleaned.slice(0, MAX_EXTRACTED_CHARS) : cleaned, truncated };
}
