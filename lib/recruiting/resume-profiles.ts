/**
 * Resume profile persistence + the parse-and-store workflow.
 *
 * Upload → private storage → documents row (Easy/Detailed Apply) → THIS:
 * download the exact stored file → extract text → parse → resume_profiles.
 * Idempotent per document (unique document_id). Parsing failures are stored
 * as FAILED/UNSUPPORTED rows and never affect the application itself.
 */

import type { ParsedResume } from "@/lib/recruiting/resume-parser";

export type ResumeProfileStatus = "PARSED" | "FAILED" | "UNSUPPORTED";

export type ResumeProfile = {
  id: string;
  candidateId: string;
  documentId: string;
  status: ResumeProfileStatus;
  parserVersion: string;
  extractedText: string | null;
  structured: ParsedResume | null;
  error: string | null;
  parsedAt: string;
};

export type ResumeProfileStore = {
  getByDocument(documentId: string): Promise<ResumeProfile | null>;
  save(profile: ResumeProfile): Promise<void>;
  latestForCandidate(candidateId: string): Promise<ResumeProfile | null>;
  /** Latest PARSED profile per candidate (for Job → candidates matching). */
  latestParsedPerCandidate(limit: number): Promise<ResumeProfile[]>;
};

export function createMemoryResumeProfileStore(seed: ResumeProfile[] = []): ResumeProfileStore & { rows: ResumeProfile[] } {
  const rows = [...seed];
  const latest = (list: ResumeProfile[]) => [...list].sort((a, b) => b.parsedAt.localeCompare(a.parsedAt))[0] ?? null;
  return {
    rows,
    async getByDocument(documentId) {
      return rows.find((r) => r.documentId === documentId) ?? null;
    },
    async save(profile) {
      const i = rows.findIndex((r) => r.documentId === profile.documentId);
      if (i >= 0) rows[i] = profile;
      else rows.push(profile);
    },
    async latestForCandidate(candidateId) {
      return latest(rows.filter((r) => r.candidateId === candidateId));
    },
    async latestParsedPerCandidate(limit) {
      const byCandidate = new Map<string, ResumeProfile>();
      for (const r of rows) {
        if (r.status !== "PARSED") continue;
        const cur = byCandidate.get(r.candidateId);
        if (!cur || r.parsedAt > cur.parsedAt) byCandidate.set(r.candidateId, r);
      }
      return [...byCandidate.values()].slice(0, limit);
    },
  };
}
