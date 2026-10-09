/**
 * Résumé storage: Vercel Blob.
 *
 * The application row in Neon holds only a URL (applications.resume_url); the
 * bytes live in Blob. Three decisions in here are deliberate and worth the
 * explanation, because each of them is easy to "simplify" into a vulnerability:
 *
 *  1. The file type is decided by reading the leading bytes, never by the
 *     extension or the browser-supplied MIME type. Both of those are attacker
 *     controlled — a `.pdf` named file carrying HTML is one line of curl — and
 *     the stored content-type is what a browser later trusts when it opens the
 *     blob. We store the type we proved, not the type we were told.
 *
 *  2. The pathname carries a random UUID segment and asks Blob for its own
 *     random suffix on top. Résumés are PII, so the store must not be walkable:
 *     without this, `resumes/2026/CA-2026-0001/ahmed-resume.pdf` is a URL any
 *     competitor could guess from a job reference and a name.
 *
 *  3. A missing BLOB_READ_WRITE_TOKEN returns null instead of throwing. The
 *     token only exists on Vercel; locally there is none, and an apply flow
 *     that crashes without it would be untestable. A résumé is enrichment on an
 *     application — losing the file is recoverable, losing the application is
 *     not.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { put } from "@vercel/blob";

/**
 * 5MB. Comfortably above any real résumé and well under the Server Action body
 * limit configured in next.config.ts (12mb), so a file that passes this check
 * has already made it through the framework's own cap.
 */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/** The only two formats accepted. The legacy binary `.doc` is not one of them. */
export type ResumeMimeType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ResumeRejectionCode = "EMPTY" | "TOO_LARGE" | "UNSUPPORTED_TYPE";

/**
 * A refusal the candidate caused and can fix (wrong format, too big), as
 * opposed to a storage outage. Typed so the caller can tell the two apart:
 * this one is worth showing them, an outage is not.
 */
export class ResumeValidationError extends Error {
  readonly code: ResumeRejectionCode;

  constructor(code: ResumeRejectionCode, message: string) {
    super(message);
    this.name = "ResumeValidationError";
    this.code = code;
  }
}

export interface StoredResume {
  /** Blob URL, written to applications.resume_url. */
  url: string;
  /** Sanitized original filename, for the recruiter's UI. */
  filename: string;
  size: number;
}

// --------------------------------------------------------------------- sniffing

/** "%PDF-" */
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
/** Local file header of any ZIP archive, which is what a DOCX is. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/**
 * OOXML wordprocessing part prefix. ZIP entry names are stored uncompressed in
 * the local headers and the central directory, so this is findable in the raw
 * bytes without unzipping. It is what separates a DOCX from an arbitrary ZIP
 * (or an XLSX, which would also start with PK).
 */
const OOXML_WORD_MARKER = Buffer.from("word/", "latin1");

/**
 * What the bytes actually are, or null if they are neither format.
 *
 * This proves the container, not that its contents are harmless: a ZIP with a
 * `word/` entry can hold anything. That is acceptable because the blob is
 * stored privately, served with the content-type proved here, and never
 * executed or rendered as HTML by this application.
 */
export function sniffResumeType(bytes: Uint8Array): ResumeMimeType | null {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);

  if (buf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return "application/pdf";
  }

  if (
    buf.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC) &&
    buf.includes(OOXML_WORD_MARKER)
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  return null;
}

/**
 * A filename safe to put in a URL path and in a Content-Disposition header.
 *
 * Path separators and traversal go first: the candidate chooses this string,
 * and it is concatenated into a blob pathname.
 */
export function sanitizeResumeFilename(name: string, fallbackExt: string): string {
  const base = name
    .split(/[/\\]/)
    .pop()!
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    // A leading dot or dash makes a hidden file or reads like a CLI flag, and
    // ".." is still traversal after the separators above are gone.
    .replace(/^[.-]+/, "")
    .replace(/-+/g, "-")
    .slice(0, 120);

  if (base === "" || base === ".") return `resume${fallbackExt}`;
  // Force the extension to match what the bytes proved, so a stored blob can
  // never advertise a type it is not.
  return base.toLowerCase().endsWith(fallbackExt) ? base : `${base}${fallbackExt}`;
}

/** Path segment form of a reference like "CA-2026-0001". */
function refSegment(applicationRef: string): string {
  const safe = applicationRef
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return safe === "" ? "unassigned" : safe;
}

// ---------------------------------------------------------------------- upload

/**
 * Validate and store one résumé.
 *
 * Returns null — rather than throwing — when Blob is not configured, so the
 * apply flow works locally and survives a storage outage in production.
 * Throws ResumeValidationError, and only that, when the file itself is
 * unacceptable; the caller decides whether to tell the candidate.
 *
 * `applicationRef` is a grouping label only (it ends up as a path segment so a
 * recruiter browsing the store sees résumés gathered per role). It is not the
 * application's own reference: that is allocated inside submitApplication's
 * transaction, which has not run yet when the upload happens. None of the
 * secrecy of the path depends on this value.
 */
export async function uploadResume(
  file: File,
  applicationRef: string,
): Promise<StoredResume | null> {
  // Cheap checks before pulling the whole file into memory.
  if (file.size <= 0) {
    throw new ResumeValidationError("EMPTY", "That file is empty. Please choose another.");
  }
  if (file.size > MAX_RESUME_BYTES) {
    throw new ResumeValidationError(
      "TOO_LARGE",
      "Resume must be 5 MB or smaller.",
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // file.size is reported by the client; the body we received is the truth.
  if (bytes.byteLength === 0) {
    throw new ResumeValidationError("EMPTY", "That file is empty. Please choose another.");
  }
  if (bytes.byteLength > MAX_RESUME_BYTES) {
    throw new ResumeValidationError(
      "TOO_LARGE",
      "Resume must be 5 MB or smaller.",
    );
  }

  const mimeType = sniffResumeType(bytes);
  if (!mimeType) {
    throw new ResumeValidationError(
      "UNSUPPORTED_TYPE",
      "Resume must be a PDF or DOCX file.",
    );
  }

  const extension = mimeType === "application/pdf" ? ".pdf" : ".docx";
  const filename = sanitizeResumeFilename(file.name, extension);

  // Validation runs first and unconditionally: a bad file is rejected the same
  // way locally as in production, rather than only once a token exists.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("[resume-storage]", {
      event: "blob-not-configured",
      detail: "BLOB_READ_WRITE_TOKEN is not set; application filed without a résumé URL.",
      applicationRef,
      filename,
      size: bytes.byteLength,
    });
    return null;
  }

  const year = new Date().getUTCFullYear();
  // Random UUID segment + Blob's own random suffix: two independent sources of
  // unguessability, so neither the job reference nor the candidate's name tells
  // anyone where the file is.
  const pathname = `resumes/${year}/${refSegment(applicationRef)}/${randomUUID()}/${filename}`;

  const blob = await put(pathname, bytes, {
    // Private, matching db/neon/001_init.sql: "the blob itself is private; the
    // app issues access". Reading one back needs a signed URL minted
    // server-side, not a bare href to resume_url.
    access: "private",
    addRandomSuffix: true,
    // The type we proved, never file.type. This is the header a browser acts on.
    contentType: mimeType,
    maximumSizeInBytes: MAX_RESUME_BYTES,
  });

  return { url: blob.url, filename, size: bytes.byteLength };
}
