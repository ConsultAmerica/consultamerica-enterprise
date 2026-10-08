import { afterEach, describe, expect, it, vi } from "vitest";

import type { Job as Posting } from "@/types/recruiting";

vi.mock("server-only", () => ({}));

const NOW = Date.now();
const iso = (offsetDays: number) => new Date(NOW + offsetDays * 86_400_000).toISOString();

function posting(slug: string, patch: Partial<Posting>): Posting {
  return {
    id: `post-${slug}`,
    requisitionId: `req-${slug}`,
    slug,
    title: `Oracle ${slug} Consultant`,
    summary: "Oracle Fusion work",
    description: "Oracle Fusion implementation work.",
    careerArea: "technology-oracle",
    departmentName: "Oracle Consulting",
    locationName: "Maryland",
    workplaceType: "HYBRID",
    employmentType: "FULL_TIME",
    responsibilities: [],
    qualifications: [],
    preferredQualifications: [],
    status: "PUBLISHED",
    publishedAt: iso(-3),
    isDemo: false,
    createdAt: iso(-5),
    updatedAt: iso(-3),
    ...patch,
  } as Posting;
}

const postings: Posting[] = [
  posting("live", {}),
  posting("expired", { expiresAt: iso(-1) }),
  posting("unpublished", { status: "UNPUBLISHED" }),
  posting("future", { publishAt: iso(5), status: "SCHEDULED", publishedAt: undefined }),
  posting("demo", { isDemo: true }),
];

vi.mock("@/lib/recruiting", () => ({
  listPublishedPostings: async () => postings,
  getPostingBySlugAny: async (slug: string) => postings.find((p) => p.slug === slug),
}));

afterEach(() => vi.unstubAllEnvs());

describe("assistant uses the same public eligibility as /jobs", () => {
  it("23–26. excludes expired, unpublished, future and (in production) demo jobs", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { publicJobSource } = await import("@/lib/assistant/public-jobs");
    const result = await publicJobSource.search({ limit: 10 });
    expect(result.jobs.map((j) => j.slug)).toEqual(["live"]);
    for (const slug of ["expired", "unpublished", "future", "demo"]) {
      expect(await publicJobSource.get(slug)).toBeNull();
    }
    expect((await publicJobSource.get("live"))?.applyHref).toBe("/jobs/live/apply");
  });

  it("demo jobs remain visible outside production, exactly like /jobs", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { publicJobSource } = await import("@/lib/assistant/public-jobs");
    const slugs = (await publicJobSource.search({ limit: 10 })).jobs.map((j) => j.slug);
    expect(slugs).toEqual(expect.arrayContaining(["live", "demo"]));
    expect(slugs).not.toContain("expired");
  });
});
