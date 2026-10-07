import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createMemoryRecruitingRepository } from "@/lib/recruiting";
import { JOB_CLOSED_MESSAGE, JobClosedError } from "@/lib/recruiting/errors";

describe("Easy Apply job eligibility errors", () => {
  it("rejects an application to a job that is not open with JobClosedError", async () => {
    const repo = createMemoryRecruitingRepository();
    const attempt = repo.submitApplication({
      requisitionId: "req-missing",
      postingId: "post-missing",
      firstName: "Test",
      lastName: "Candidate",
      email: "test.candidate@example.com",
      source: "Careers Site",
    });

    await expect(attempt).rejects.toBeInstanceOf(JobClosedError);
    await expect(attempt).rejects.toThrow(JOB_CLOSED_MESSAGE);
  });
});
