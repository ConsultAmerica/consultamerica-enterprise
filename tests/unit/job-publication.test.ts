import { describe, expect, it } from "vitest";

import { isPubliclyOpen, planJobMaintenance } from "@/lib/jobs/eligibility";

const now = new Date("2026-10-01T12:00:00.000Z");

describe("public job eligibility", () => {
  it("shows an open job inside its posting window", () => {
    expect(
      isPubliclyOpen(
        {
          status: "OPEN",
          publishedAt: "2026-09-01T00:00:00.000Z",
          expiresAt: "2026-12-01T00:00:00.000Z",
        },
        now,
      ),
    ).toBe(true);
  });

  it("hides drafts, scheduled future jobs, paused, closed, filled, and expired statuses", () => {
    for (const status of ["DRAFT", "SCHEDULED", "PAUSED", "CLOSED", "FILLED", "EXPIRED", "ARCHIVED"]) {
      expect(isPubliclyOpen({ status, publishedAt: "2026-09-01T00:00:00.000Z" }, now)).toBe(false);
    }
  });

  it("hides a published job after its expiration or deadline", () => {
    expect(
      isPubliclyOpen(
        { status: "PUBLISHED", publishedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-30T00:00:00.000Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isPubliclyOpen(
        {
          status: "PUBLISHED",
          publishedAt: "2026-09-01T00:00:00.000Z",
          applicationDeadline: "2026-09-30T00:00:00.000Z",
        },
        now,
      ),
    ).toBe(false);
  });

  it("promotes due scheduled jobs and expires overdue live jobs once", () => {
    const jobs = [
      { id: "due", status: "SCHEDULED", publishAt: "2026-10-01T11:00:00.000Z" },
      { id: "future", status: "SCHEDULED", publishAt: "2026-11-01T00:00:00.000Z" },
      { id: "old", status: "OPEN", publishedAt: "2026-08-01T00:00:00.000Z", expiresAt: "2026-09-01T00:00:00.000Z" },
      { id: "live", status: "PUBLISHED", publishedAt: "2026-09-20T00:00:00.000Z", expiresAt: "2026-12-01T00:00:00.000Z" },
      { id: "already", status: "EXPIRED", expiresAt: "2026-09-01T00:00:00.000Z" },
    ];
    const first = planJobMaintenance(jobs, now);
    expect(first.publishIds).toEqual(["due"]);
    expect(first.expireIds).toEqual(["old"]);

    const after = planJobMaintenance(
      jobs.map((job) => {
        if (job.id === "due") return { ...job, status: "OPEN", publishedAt: now.toISOString() };
        if (job.id === "old") return { ...job, status: "EXPIRED" };
        return job;
      }),
      now,
    );
    expect(after.publishIds).toEqual([]);
    expect(after.expireIds).toEqual([]);
  });
});
