import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { sanitizeReturnTo } = await import("@/lib/auth/return-to");
const { isRecruitingStaff } = await import("@/lib/auth/recruiting");
const { checkPublicRateLimit, createMemoryRateLimitStore, visitorBucket } = await import("@/lib/assistant/rate-limit");

describe("auth helpers", () => {
  it("recruiting staff mirrors SQL is_recruiting_staff(); candidates and hiring managers are excluded", () => {
    for (const role of ["RECRUITER", "HR_ADMIN", "HR_SPECIALIST", "SYSTEM_ADMIN"]) expect(isRecruitingStaff([role])).toBe(true);
    for (const role of ["CANDIDATE", "HIRING_MANAGER", "EMPLOYEE", "PAYROLL_ADMIN"]) expect(isRecruitingStaff([role])).toBe(false);
    expect(isRecruitingStaff([])).toBe(false);
  });

  it("post-login redirects stay inside the workspace (no open redirect)", () => {
    expect(sanitizeReturnTo("/app/recruiting/job-intake")).toBe("/app/recruiting/job-intake");
    for (const bad of ["https://evil.example", "//evil.example", "/jobs", "/app/../admin", "/app\\x", "javascript:alert(1)"]) {
      expect(sanitizeReturnTo(bad)).toBeNull();
    }
  });
});

describe("public endpoint rate limiting", () => {
  it("limits each visitor and stores only a salted hash of the IP", async () => {
    const store = createMemoryRateLimitStore(() => 1_000_000);
    const results = [];
    for (let i = 0; i < 22; i++) results.push((await checkPublicRateLimit("assistant", "203.0.113.7", { store, production: true })).allowed);
    expect(results.filter(Boolean)).toHaveLength(20);
    expect(visitorBucket("203.0.113.7", "salt")).not.toContain("203.0.113.7");
  });

  it("keeps assistant and resume-prefill budgets separate", async () => {
    const store = createMemoryRateLimitStore(() => 1_000_000);
    for (let i = 0; i < 10; i++) await checkPublicRateLimit("resume-prefill", "198.51.100.1", { store, production: true });
    expect((await checkPublicRateLimit("resume-prefill", "198.51.100.1", { store, production: true })).allowed).toBe(false);
    expect((await checkPublicRateLimit("assistant", "198.51.100.1", { store, production: true })).allowed).toBe(true);
  });

  it("fails closed in production when the rate-limit store is unavailable", async () => {
    const broken = { hit: async () => { throw new Error("down"); } };
    expect(await checkPublicRateLimit("assistant", "x", { store: broken, production: true })).toEqual({ allowed: false, reason: "store-unavailable" });
  });
});
