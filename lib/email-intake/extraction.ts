/**
 * Anti-fabrication gate for AI job extraction (pure).
 *
 * The model must return, for every field, a value plus a verbatim evidence
 * quote. A value is kept only when its evidence actually appears in the email
 * subject/body/attachments; otherwise it is downgraded to MISSING. Fields in
 * EXPLICIT_ONLY_FIELDS (pay, arrangement, years, dates…) may never be INFERRED.
 */

import { canonical } from "@/lib/email-intake/normalize";
import {
  EXPLICIT_ONLY_FIELDS,
  EXTRACTION_FIELDS,
  FIELD_LABELS,
  LIST_FIELDS,
  type ExtractedField,
  type ExtractionFieldKey,
  type JobExtraction,
} from "@/lib/email-intake/types";

export type RawExtractedField = {
  value?: unknown;
  status?: unknown;
  evidence?: unknown;
  source?: unknown;
  confidence?: unknown;
};

export const MISSING: ExtractedField = { value: null, status: "MISSING", evidence: null, source: null, confidence: null };

const LIST_SET = new Set<string>(LIST_FIELDS);
const SOURCES = new Set(["subject", "body", "attachment", "thread"]);

function significantTokens(value: string): string[] {
  return canonical(value)
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t.length >= 3 && !["and", "the", "for", "with", "per"].includes(t));
}

function normalizeValue(key: ExtractionFieldKey, value: unknown): string | string[] | null {
  if (LIST_SET.has(key)) {
    if (!Array.isArray(value)) return null;
    const items = value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
    return items.length ? [...new Set(items)].slice(0, 30) : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, key === "description" ? 4000 : 300) : null;
}

export function validateExtraction(
  raw: Partial<Record<ExtractionFieldKey, RawExtractedField>> | null | undefined,
  sources: { subject: string | null; body: string; attachments: string; thread: string },
): JobExtraction {
  const corpus = canonical([sources.subject ?? "", sources.body, sources.attachments, sources.thread].join("\n"));
  const warnings: string[] = [];
  const fields = {} as Record<ExtractionFieldKey, ExtractedField>;

  for (const key of EXTRACTION_FIELDS) {
    const item = raw?.[key];
    const status = item?.status === "EXPLICIT" || item?.status === "INFERRED" ? item.status : "MISSING";
    const value = normalizeValue(key, item?.value);
    const evidence = typeof item?.evidence === "string" ? item.evidence.trim().slice(0, 500) : "";

    if (status === "MISSING" || value === null) {
      fields[key] = MISSING;
      continue;
    }
    if (status === "INFERRED" && EXPLICIT_ONLY_FIELDS.has(key)) {
      fields[key] = MISSING;
      warnings.push(`${FIELD_LABELS[key]}: not stated in the email, so it was left blank.`);
      continue;
    }
    if (!evidence || !corpus.includes(canonical(evidence))) {
      fields[key] = MISSING;
      warnings.push(`${FIELD_LABELS[key]}: proposed value had no supporting quote in the email and was removed.`);
      continue;
    }

    let finalStatus = status as "EXPLICIT" | "INFERRED";
    if (finalStatus === "EXPLICIT") {
      // An "explicit" value must share wording with its quote (descriptions are summaries).
      const tokens = Array.isArray(value) ? value.flatMap(significantTokens) : significantTokens(value);
      const quote = canonical(evidence);
      const overlap = tokens.some((t) => quote.includes(t));
      if (tokens.length && !overlap && key !== "description") {
        if (EXPLICIT_ONLY_FIELDS.has(key)) {
          fields[key] = MISSING;
          warnings.push(`${FIELD_LABELS[key]}: value did not match its quote and was removed.`);
          continue;
        }
        finalStatus = "INFERRED";
      }
    }

    const confidence = typeof item?.confidence === "number" ? Math.min(1, Math.max(0, item.confidence)) : null;
    const source = typeof item?.source === "string" && SOURCES.has(item.source) ? (item.source as ExtractedField["source"]) : "body";
    fields[key] = { value, status: finalStatus, evidence, source, confidence };
  }

  return { fields, warnings };
}

export function emptyExtraction(warning?: string): JobExtraction {
  const fields = {} as Record<ExtractionFieldKey, ExtractedField>;
  for (const key of EXTRACTION_FIELDS) fields[key] = MISSING;
  return { fields, warnings: warning ? [warning] : [] };
}

export function fieldText(field: ExtractedField | undefined): string {
  if (!field || field.value === null) return "";
  return Array.isArray(field.value) ? field.value.join(", ") : field.value;
}
