import { describe, expect, it } from "vitest";

import { analyzeCandidateForJob, requirementsFromJob } from "@/lib/recruiting/job-analyzer";
import {
  MATCHER_VERSION,
  jobFingerprint,
  matchFreshness,
  planRecalculation,
  resumeFingerprint,
  stableStringify,
  toStoredMatch,
} from "@/lib/recruiting/match-persistence";
import { parseResumeByRules } from "@/lib/recruiting/resume-parser";

const job = {
  title: "Data Engineer",
  description: "Build pipelines.",
  qualifications: ["3+ years with Python and SQL", "Bachelor's degree"],
  skills: ["Python"],
};
const text = "Sam Lee\nSkills: Python, SQL, Airflow\nData Engineer, Acme 2019 - Present";

describe("match persistence design", () => {
  it("stable serialization ignores key order", () => {
    expect(stableStringify({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(stableStringify({ a: [{ x: 1, y: 2 }], b: 1 }));
  });

  it("job fingerprints ignore whitespace and skill order but change with content", () => {
    const a = jobFingerprint(job);
    expect(jobFingerprint({ ...job, description: "  Build   pipelines. " })).toBe(a);
    expect(jobFingerprint({ ...job, skills: ["Python"] })).toBe(a);
    expect(jobFingerprint({ ...job, qualifications: [...job.qualifications, "Kafka"] })).not.toBe(a);
  });

  it("résumé fingerprints change with parser version, content or candidate corrections", () => {
    const structured = parseResumeByRules(text);
    const base = { documentId: "doc-1", parserVersion: "resume-parser/1", structured };
    const fp = resumeFingerprint(base);
    expect(resumeFingerprint({ ...base })).toBe(fp);
    expect(resumeFingerprint({ ...base, parserVersion: "resume-parser/2" })).not.toBe(fp);
    expect(
      resumeFingerprint({
        ...base,
        candidateReviewed: { summary: "", skills: ["Python"], experience: [], education: [], certifications: [], portfolioUrl: "" },
      }),
    ).not.toBe(fp);
  });

  it("detects stale results on read and explains why", () => {
    const requirements = requirementsFromJob(job);
    const analysis = analyzeCandidateForJob({ parsed: parseResumeByRules(text), resumeText: text }, requirements);
    const stored = toStoredMatch({
      id: "m-1",
      candidateId: "c-1",
      resumeProfileId: "rp-1",
      requisitionId: "req-1",
      jobAnalysisId: "ja-1",
      resumeFingerprint: "r1",
      jobFingerprint: "j1",
      analysis,
      computedAt: "2026-10-07T00:00:00Z",
    });
    expect(stored).toMatchObject({ matcherVersion: MATCHER_VERSION, status: "CURRENT", score: analysis.score });
    // Advisory only: the stored shape has no application or status-changing field.
    expect(Object.keys(stored)).not.toContain("applicationId");
    expect(stored.analysis.findings.every((f) => ["MATCHED", "NOT_FOUND", "UNKNOWN"].includes(f.status))).toBe(true);

    expect(matchFreshness(stored, { resumeFingerprint: "r1", jobFingerprint: "j1" })).toEqual({ fresh: true });
    expect(matchFreshness(stored, { resumeFingerprint: "r2", jobFingerprint: "j1" })).toEqual({ fresh: false, reasons: ["RESUME_CHANGED"] });
    expect(matchFreshness(stored, { resumeFingerprint: "r1", jobFingerprint: "j1", matcherVersion: "job-analyzer/2" })).toEqual({
      fresh: false,
      reasons: ["MATCHER_UPGRADED"],
    });
  });

  it("plans recalculation for each kind of source change", () => {
    expect(planRecalculation({ type: "RESUME_REVIEWED", candidateId: "c", resumeProfileId: "rp" })).toEqual({
      markStale: [{ by: "resumeProfileId", id: "rp" }],
      enqueue: [{ subjectType: "RESUME_PROFILE", subjectId: "rp", reason: "RESUME_REVIEWED" }],
    });
    expect(planRecalculation({ type: "REQUISITION_UPDATED", requisitionId: "req" }).enqueue).toHaveLength(1);
    // A closed job is staled but never recomputed or recommended.
    expect(planRecalculation({ type: "JOB_PUBLICATION_CHANGED", requisitionId: "req", open: false })).toEqual({
      markStale: [{ by: "requisitionId", id: "req" }],
      enqueue: [],
    });
    expect(planRecalculation({ type: "MATCHER_UPGRADED" }).markStale).toEqual([{ by: "all", id: "*" }]);
  });
});
