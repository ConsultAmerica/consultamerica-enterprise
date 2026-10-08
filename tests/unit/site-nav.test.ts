import { describe, expect, it } from "vitest";

import {
  CAREERS_NAV,
  CONTACT_CTA,
  LEARN_ABOUT_CAREERS,
  PRIMARY_NAV,
  SEARCH_OPEN_JOBS,
  isActivePath,
  navHref,
} from "@/components/marketing/nav-config";

describe("shared marketing navigation", () => {
  it("keeps every existing destination and groups Careers + Jobs under one Careers menu", () => {
    expect(PRIMARY_NAV.map((i) => i.label)).toEqual(["About", "Capabilities", "Industries", "Products", "AI", "Talent", "Insights"]);
    expect(PRIMARY_NAV.some((i) => i.label === "Jobs" || i.label === "Careers")).toBe(false);
    expect(CAREERS_NAV.items.map((i) => [i.label, i.href])).toEqual([
      ["Explore Careers", "/careers"],
      ["Search Open Jobs", "/jobs"],
    ]);
    expect(CONTACT_CTA).toMatchObject({ label: "Talk to an expert", href: "/#contact" });
  });

  it("uses in-page anchors only on the homepage", () => {
    const capabilities = PRIMARY_NAV.find((i) => i.label === "Capabilities")!;
    expect(navHref(capabilities, true)).toBe("#capabilities");
    expect(navHref(capabilities, false)).toBe("/#capabilities");
    const about = PRIMARY_NAV.find((i) => i.label === "About")!;
    expect(navHref(about, true)).toBe("/about");
  });

  it("marks the Careers pages active, including job detail pages", () => {
    expect(isActivePath("/jobs", "/jobs")).toBe(true);
    expect(isActivePath("/jobs/senior-engineer", "/jobs")).toBe(true);
    expect(isActivePath("/jobsearch", "/jobs")).toBe(false);
    expect(isActivePath("/careers", "/jobs")).toBe(false);
    expect(isActivePath("/", "/#capabilities")).toBe(false);
  });

  it("cross-page CTAs point at each other", () => {
    expect(SEARCH_OPEN_JOBS).toEqual({ label: "Search Open Jobs", href: "/jobs" });
    expect(LEARN_ABOUT_CAREERS).toEqual({ label: "Learn About Careers", href: "/careers" });
  });
});
