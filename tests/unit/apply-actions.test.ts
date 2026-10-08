import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const afterMock = vi.fn();
vi.mock("next/server", () => ({ after: (fn: () => unknown) => afterMock(fn) }));

const submitApplication = vi.fn();
vi.mock("@/lib/recruiting", () => ({ recruitingRepository: { submitApplication: (...a: unknown[]) => submitApplication(...a) } }));

const saveApplicationSnapshot = vi.fn();
vi.mock("@/lib/recruiting/application-snapshots", async () => {
  const { z } = await import("zod");
  return {
    detailedProfileSchema: z.object({ skills: z.array(z.string()).default([]), experience: z.array(z.any()).default([]), education: z.array(z.any()).default([]), certifications: z.array(z.string()).default([]), summary: z.string().default(""), portfolioUrl: z.string().default("") }),
    saveApplicationSnapshot: (...a: unknown[]) => saveApplicationSnapshot(...a),
  };
});

const { submitJobApplication, submitDetailedApplication } = await import("@/lib/recruiting/actions");
const { JobClosedError } = await import("@/lib/recruiting/errors");

const input = { requisitionId: "req-1", postingId: "post-1", firstName: "Test", lastName: "Candidate", email: "t@example.com", phone: "555" };
const withResume = (extra: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("resume", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "resume.pdf", { type: "application/pdf" }));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  submitApplication.mockReset();
  saveApplicationSnapshot.mockReset();
  afterMock.mockReset();
});

describe("Easy Apply and Detailed Apply share one candidate/application pipeline", () => {
  it("Easy Apply → candidate, application, private resume (passed to the workflow), then schedules parsing", async () => {
    submitApplication.mockResolvedValue({ candidateId: "c1", applicationId: "a1", applicationNumber: "APP-1", resumeDocumentId: "d1", outcome: "created" });
    const res = await submitJobApplication(input, withResume());
    expect(res).toEqual({ ok: true, candidateId: "c1", applicationId: "a1", applicationNumber: "APP-1" });
    expect(submitApplication.mock.calls[0][0].resume).toMatchObject({ fileName: "resume.pdf", mimeType: "application/pdf" });
    expect(submitApplication.mock.calls[0][0].source).toBe("Careers Site");
    expect(afterMock).toHaveBeenCalledTimes(1); // resume → profile runs after the response
  });

  it("requires a resume and never calls the workflow without one", async () => {
    const res = await submitJobApplication(input, new FormData());
    expect(res.ok).toBe(false);
    expect(submitApplication).not.toHaveBeenCalled();
  });

  it("upload/persistence failure → no success, generic message (no internals)", async () => {
    submitApplication.mockRejectedValue(Object.assign(new Error("Storage upload failed: bucket candidate-documents"), { name: "EasyApplyStageError" }));
    const res = await submitJobApplication(input, withResume());
    expect(res).toEqual({ ok: false, error: "We couldn't complete your application. Please try again." });
  });

  it("closed job → the closed-job message", async () => {
    submitApplication.mockRejectedValue(new JobClosedError());
    expect(await submitJobApplication(input, withResume())).toEqual({ ok: false, error: "This position is no longer accepting applications." });
  });

  it("duplicate application → same application returned, no re-parse", async () => {
    submitApplication.mockResolvedValue({ candidateId: "c1", applicationId: "a1", applicationNumber: "APP-1", resumeDocumentId: "d1", outcome: "existing" });
    const res = await submitJobApplication(input, withResume());
    expect(res.ok && res.applicationId).toBe("a1");
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("Detailed Apply → the same workflow plus the candidate-reviewed snapshot", async () => {
    submitApplication.mockResolvedValue({ candidateId: "c1", applicationId: "a2", applicationNumber: "APP-2", resumeDocumentId: "d2", outcome: "created" });
    const profile = { skills: ["OIC", "REST"], experience: [{ title: "Developer" }], education: [], certifications: [] };
    const res = await submitDetailedApplication(input, withResume({ profile: JSON.stringify(profile), answers: "[]" }));
    expect(res.ok).toBe(true);
    expect(submitApplication.mock.calls[0][0].source).toBe("Careers Site — Detailed Apply");
    expect(saveApplicationSnapshot).toHaveBeenCalledWith(expect.objectContaining({ applicationId: "a2", candidateId: "c1", profile: expect.objectContaining({ skills: ["OIC", "REST"] }) }));
  });

  it("Detailed Apply snapshot failure → not reported as success (a retry recovers the same application)", async () => {
    submitApplication.mockResolvedValue({ candidateId: "c1", applicationId: "a2", applicationNumber: "APP-2", resumeDocumentId: "d2", outcome: "created" });
    saveApplicationSnapshot.mockRejectedValueOnce(new Error("db down"));
    const res = await submitDetailedApplication(input, withResume({ profile: "{}", answers: "[]" }));
    expect(res.ok).toBe(false);
  });

  it("Detailed Apply rejects a malformed profile payload before touching the database", async () => {
    const res = await submitDetailedApplication(input, withResume({ profile: "not json" }));
    expect(res.ok).toBe(false);
    expect(submitApplication).not.toHaveBeenCalled();
  });
});
