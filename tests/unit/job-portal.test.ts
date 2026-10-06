import { describe, expect, it } from "vitest";

import { stagingPortalJobs } from "@/data/recruiting/staging-portal-jobs";
import {
  dedupeExternalJobs,
  normalizeExternalJob,
  verificationDecision,
} from "@/lib/jobs/external-source";
import {
  isVerifiedJob,
  queryPortalJobs,
  safeExternalApplyUrl,
  type PortalJob,
} from "@/lib/jobs/portal";

function job(overrides: Partial<PortalJob> & Pick<PortalJob, "id" | "title">): PortalJob {
  return {
    company: "Consult America",
    department: "Consulting",
    location: "Ashburn, VA",
    workplaceType: "Hybrid",
    employmentType: "Full Time",
    summary: overrides.title,
    description: overrides.title,
    requisitionId: overrides.id,
    postedAt: "2026-10-01T12:00:00.000Z",
    acceptingApplications: true,
    applicationType: "INTERNAL",
    skills: [],
    categories: [],
    ...overrides,
  };
}

const now = new Date("2026-10-05T12:00:00.000Z");

describe("public job portal query", () => {
  const jobs = [
    job({ id: "1", title: "Oracle Consultant", categories: [{ id: "oracle", label: "Oracle" }], workplaceType: "Remote", employmentType: "Contract", postedAt: "2026-10-04T12:00:00.000Z", skills: ["Oracle"] }),
    job({ id: "2", title: "AI Engineer", categories: [{ id: "ai-ml", label: "AI" }], applicationType: "EXTERNAL", postedAt: "2026-09-01T12:00:00.000Z" }),
    job({ id: "3", title: "Closed role", acceptingApplications: false }),
  ];

  it("keeps search, category, arrangement, employment, date, and Easy Apply together", () => {
    const result = queryPortalJobs(jobs, {
      q: "oracle",
      category: "oracle",
      arrangement: "Remote",
      employment: "Contract",
      date: "7d",
      easy: true,
    }, now);
    expect(result.jobs.map((item) => item.id)).toEqual(["1"]);
    expect(result.total).toBe(1);
  });

  it("does not treat a closed job as a public result", () => {
    expect(queryPortalJobs(jobs, {}, now).jobs.map((item) => item.id)).not.toContain("3");
  });

  it("limits Easy Apply to internal applications", () => {
    const result = queryPortalJobs(jobs, { easy: true }, now);
    expect(result.jobs.every((item) => item.applicationType === "INTERNAL")).toBe(true);
  });

  it("rejects unsafe apply URLs and unverified database rows", () => {
    expect(safeExternalApplyUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalApplyUrl("https://example.com/jobs/1")).toBe("https://example.com/jobs/1");
    expect(isVerifiedJob({ verified: true, isDemo: true })).toBe(false);
    expect(isVerifiedJob({ verified: false })).toBe(false);
    expect(isVerifiedJob({ verified: true, isDemo: false })).toBe(true);
  });
});

describe("staging catalog isolation", () => {
  it("marks every staging job as demo sample copy so production listing excludes it", () => {
    const jobs = stagingPortalJobs();
    expect(jobs.length).toBeGreaterThanOrEqual(40);
    for (const posting of jobs) {
      expect(posting.isDemo).toBe(true);
      expect(posting.verified).toBe(false);
      expect(posting.description).toContain("sample position for development and design review");
    }
  });

  it("keeps staging jobs out of production through demo and sample-copy markers", () => {
    const jobs = stagingPortalJobs();
    expect(jobs.every((posting) => posting.isDemo)).toBe(true);
    expect(
      jobs.every((posting) =>
        posting.description.includes("sample position for development and design review"),
      ),
    ).toBe(true);
  });
});

describe("external job intake", () => {
  it("normalizes https records and drops duplicates", () => {
    const first = normalizeExternalJob({
      source: "employer-feed",
      externalJobId: "abc",
      sourceUrl: "https://employer.example/jobs/abc",
      title: "Cloud Engineer",
      applyUrl: "https://employer.example/apply/abc",
    });
    const duplicate = first ? { ...first } : null;
    expect(first?.externalApplyUrl).toBe("https://employer.example/apply/abc");
    expect(dedupeExternalJobs([first, duplicate].filter(Boolean) as NonNullable<typeof first>[])).toHaveLength(1);
    expect(normalizeExternalJob({
      source: "employer-feed",
      externalJobId: "bad",
      sourceUrl: "javascript:alert(1)",
      title: "Bad",
    })).toBeNull();
  });

  it("retries a failed verification instead of expiring the job", () => {
    expect(verificationDecision({ confirmedClosed: false, problem: "timeout" })).toBe("retry");
    expect(verificationDecision({ confirmedClosed: true })).toBe("expire");
  });
});
