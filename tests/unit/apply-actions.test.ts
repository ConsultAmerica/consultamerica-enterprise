import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const afterMock = vi.fn();
vi.mock("next/server", () => ({ after: (fn: () => unknown) => afterMock(fn) }));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
const rateLimit = vi.fn();
vi.mock("@/lib/assistant/rate-limit", () => ({
  checkPublicRateLimit: (...a: unknown[]) => rateLimit(...a),
  clientIp: (h: Headers) => h.get("x-forwarded-for") ?? "unknown",
}));

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
  rateLimit.mockReset();
  rateLimit.mockResolvedValue({ allowed: true });
});

describe("Easy Apply and Detailed Apply share one candidate/application pipeline", () => {
  it("Easy Apply → candidate, application, private resume (passed to the workflow), then schedules parsing", async () => {
    submitApplication.mockResolvedValue({ candidateId: "c1", applicationId: "a1", applicationNumber: "APP-1", resumeDocumentId: "d1", outcome: "created" });
    const res = await submitJobApplication(input, withResume());
    // Anonymous response: reference number only, no internal ids.
    expect(res).toEqual({ ok: true, applicationNumber: "APP-1" });
    expect(submitApplication.mock.calls[0][0].allowPortalInvite).toBe(true);
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

  it("duplicate application → no duplicate, no re-parse, and the response doesn't reveal the earlier application", async () => {
    submitApplication.mockResolvedValue({ candidateId: "c1", applicationId: "a1", applicationNumber: "APP-1", resumeDocumentId: "d1", outcome: "existing" });
    const res = await submitJobApplication(input, withResume());
    // Same shape as a new submission, minus the reference: the typed email is unverified.
    expect(res).toEqual({ ok: true, applicationNumber: "" });
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("recovered (retry completed an earlier partial attempt) → success without the reference", async () => {
    submitApplication.mockResolvedValue({ candidateId: "c1", applicationId: "a1", applicationNumber: "APP-1", resumeDocumentId: "d1", outcome: "recovered" });
    expect(await submitJobApplication(input, withResume())).toEqual({ ok: true, applicationNumber: "" });
  });

  it("invitation rate limit reached → application still filed, invitation skipped", async () => {
    rateLimit.mockResolvedValue({ allowed: false, reason: "visitor" });
    submitApplication.mockResolvedValue({ candidateId: "c1", applicationId: "a1", applicationNumber: "APP-1", resumeDocumentId: "d1", outcome: "created" });
    expect(await submitJobApplication(input, withResume())).toEqual({ ok: true, applicationNumber: "APP-1" });
    expect(rateLimit).toHaveBeenCalledWith("candidate-invite", "203.0.113.7");
    expect(submitApplication.mock.calls[0][0].allowPortalInvite).toBe(false);
  });

  it("limiter store unavailable (migration 045 missing) → invitations are not blocked", async () => {
    rateLimit.mockResolvedValue({ allowed: false, reason: "store-unavailable" });
    submitApplication.mockResolvedValue({ candidateId: "c1", applicationId: "a1", applicationNumber: "APP-1", resumeDocumentId: "d1", outcome: "created" });
    await submitJobApplication(input, withResume());
    expect(submitApplication.mock.calls[0][0].allowPortalInvite).toBe(true);
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
