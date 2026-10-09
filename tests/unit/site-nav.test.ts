import { describe, expect, it } from "vitest";

import {
  CONTACT_CTA,
  LEARN_ABOUT_CAREERS,
  PRIMARY_NAV,
  SEARCH_OPEN_JOBS,
  isActivePath,
  isNavItemActive,
  navHref,
} from "@/components/marketing/nav-config";

describe("shared marketing navigation", () => {
  it("keeps every destination, with one combined Careers link", () => {
    // AI, Talent and Insights were removed from the top level, and About was
    // renamed to the page it actually opens. Their destinations remain reachable
    // from the homepage sections, the footer and the Capabilities mega panel.
    expect(PRIMARY_NAV.map((i) => i.label)).toEqual([
      "Capabilities",
      "Industries",
      "Products",
      "Careers",
      "Life at Consult America",
    ]);
    const careers = PRIMARY_NAV.find((i) => i.label === "Careers")!;
    expect(careers).toEqual({ label: "Careers", href: "/careers", alsoActiveOn: ["/jobs"] });
    expect(careers.mega).toBeUndefined();
    expect(CONTACT_CTA).toMatchObject({ label: "Talk to an expert", href: "/#contact" });
  });

  it("has no duplicate entries, no separate Jobs link and no 'Search Open Jobs' menu entry", () => {
    const labels = PRIMARY_NAV.map((i) => i.label);
    const hrefs = PRIMARY_NAV.map((i) => i.href);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(labels).not.toContain("Jobs");
    expect(labels).not.toContain("Search Open Jobs");
    expect(hrefs).not.toContain("/jobs");
  });

  it("uses in-page anchors only on the homepage; Careers always links to its page", () => {
    const capabilities = PRIMARY_NAV.find((i) => i.label === "Capabilities")!;
    expect(navHref(capabilities, true)).toBe("#capabilities");
    expect(navHref(capabilities, false)).toBe("/#capabilities");
    for (const label of ["Life at Consult America", "Careers"]) {
      const item = PRIMARY_NAV.find((i) => i.label === label)!;
      expect(navHref(item, true)).toBe(item.href);
    }
  });

  it("Careers is the current item on /careers, /jobs and job detail pages", () => {
    const careers = PRIMARY_NAV.find((i) => i.label === "Careers")!;
    for (const path of ["/careers", "/jobs", "/jobs/senior-engineer", "/jobs/senior-engineer/apply"]) {
      expect(isNavItemActive(path, careers)).toBe(true);
    }
    expect(isNavItemActive("/jobsearch", careers)).toBe(false);
    expect(isNavItemActive("/about", careers)).toBe(false);
    const life = PRIMARY_NAV.find((i) => i.label === "Life at Consult America")!;
    expect(isNavItemActive("/jobs", life)).toBe(false);
    expect(isNavItemActive("/life", life)).toBe(true);
  });

  it("isActivePath matches a page and its children only", () => {
    expect(isActivePath("/jobs", "/jobs")).toBe(true);
    expect(isActivePath("/jobs/senior-engineer", "/jobs")).toBe(true);
    expect(isActivePath("/jobsearch", "/jobs")).toBe(false);
    expect(isActivePath("/careers", "/jobs")).toBe(false);
    expect(isActivePath("/careers", "/careers")).toBe(true);
    expect(isActivePath("/jobs/x", "/careers")).toBe(false);
    expect(isActivePath("/", "/#capabilities")).toBe(false);
  });

  it("cross-page CTAs on the Careers and Jobs pages point at each other", () => {
    expect(SEARCH_OPEN_JOBS).toEqual({ label: "Search Open Jobs", href: "/jobs" });
    expect(LEARN_ABOUT_CAREERS).toEqual({ label: "Learn About Careers", href: "/careers" });
  });
});
