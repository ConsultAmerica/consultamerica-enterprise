import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { CAPABILITY_FAMILIES, INDUSTRY_PAGES, enquirySource, getIndustry, industryHref } from "@/data/industries";
import { getInsight } from "@/data/insights";
import { INDUSTRIES } from "@/data/marketing";
import { getService } from "@/data/services";
import { renderEnquiryEmail } from "@/lib/email/enquiry-template";

describe("industry pages", () => {
  it("publishes exactly the five agreed routes", () => {
    expect(INDUSTRY_PAGES.map((i) => `/industries/${i.slug}`)).toEqual([
      "/industries/financial-services",
      "/industries/public-sector",
      "/industries/supply-chain",
      "/industries/manufacturing",
      "/industries/retail",
    ]);
  });

  it("covers every INDUSTRIES name, so nav, footer and assistant resolve to a page", () => {
    const names = INDUSTRY_PAGES.map((i) => i.name).sort();
    expect(names).toEqual(INDUSTRIES.map(([name]) => name).sort());
    for (const [name] of INDUSTRIES) {
      expect(industryHref(name)).toMatch(/^\/industries\/[a-z-]+$/);
    }
    expect(industryHref("Not an industry")).toBe("/industries");
  });

  it("looks pages up by slug", () => {
    expect(getIndustry("retail")?.name).toBe("Retail");
    expect(getIndustry("nope")).toBeUndefined();
  });

  it.each(INDUSTRY_PAGES.map((i) => [i.slug, i] as const))("%s has every section the template needs", (_, industry) => {
    expect(industry.themes).toHaveLength(5);
    expect(industry.challenge.items.length).toBeGreaterThanOrEqual(3);
    expect(industry.help.points.length).toBeGreaterThanOrEqual(3);
    expect(industry.solutions.length).toBeGreaterThanOrEqual(4);
    expect(industry.solutions.length).toBeLessThanOrEqual(6);
    expect(industry.capabilities.map((c) => c.family)).toEqual([...CAPABILITY_FAMILIES]);
    expect(industry.useCases.length).toBeGreaterThanOrEqual(3);
    expect(industry.approach.length).toBeGreaterThanOrEqual(3);
    expect(industry.faqs.length).toBeGreaterThanOrEqual(4);
    expect(industry.description.length).toBeLessThanOrEqual(220);
  });

  it.each(INDUSTRY_PAGES.map((i) => [i.slug, i] as const))("%s links only to service pages that exist", (_, industry) => {
    expect(industry.services.length).toBeGreaterThanOrEqual(4);
    for (const slug of industry.services) {
      expect(getService(slug), slug).toBeDefined();
    }
  });

  it.each(INDUSTRY_PAGES.map((i) => [i.slug, i] as const))(
    "%s gives every solution card a service link that resolves, and only real insights",
    (_, industry) => {
      for (const s of industry.solutions) {
        expect(s.service, s.title).toBeDefined();
        expect(getService(s.service!), `${s.title} -> ${s.service}`).toBeDefined();
      }
      expect(industry.insights.length).toBeGreaterThanOrEqual(1);
      for (const slug of industry.insights) {
        expect(getInsight(slug), slug).toBeDefined();
      }
    },
  );

  it("publishes no case study without a named approver", () => {
    for (const industry of INDUSTRY_PAGES) {
      for (const c of industry.caseStudies) {
        expect(c.approvedBy.trim(), c.title).not.toBe("");
        expect(c.outcomes.length, c.title).toBeGreaterThan(0);
      }
    }
  });

  it("ships the photo each page and card uses", () => {
    for (const industry of INDUSTRY_PAGES) {
      expect(existsSync(path.join(process.cwd(), "public", industry.image)), industry.image).toBe(true);
    }
  });

  it("gives each industry its own copy and photo, not a shared template paragraph", () => {
    const fields = [
      INDUSTRY_PAGES.map((i) => i.image),
      INDUSTRY_PAGES.map((i) => i.headline),
      INDUSTRY_PAGES.map((i) => i.challenge.lead),
      INDUSTRY_PAGES.map((i) => i.help.lead),
      INDUSTRY_PAGES.flatMap((i) => i.challenge.items.map(([title]) => title)),
      INDUSTRY_PAGES.flatMap((i) => i.useCases.map(([title]) => title)),
    ];
    for (const values of fields) {
      expect(new Set(values).size).toBe(values.length);
    }
  });
});

describe("enquiry source", () => {
  it("names the industry page an enquiry came from", () => {
    expect(enquirySource("/industries/retail")).toBe("Retail industry page");
    expect(enquirySource("/industries/public-sector")).toBe("Public Sector industry page");
    expect(enquirySource("/industries")).toBe("Industries overview page");
  });

  it("never echoes a path it does not recognise", () => {
    for (const p of ["/", "/careers", "/industries/nope", "/industries/retail/x", "<b>hi</b>", 42, null, undefined]) {
      expect(enquirySource(p)).toBeUndefined();
    }
  });

  it("puts the source in the enquiry email, defaulting to the form name", () => {
    const base = { name: "Jane Doe", email: "jane@example.com", company: "Acme", interest: "AI & Data", message: "Hi" };
    const withSource = renderEnquiryEmail({ ...base, source: "Retail industry page" });
    expect(withSource.html).toContain("Retail industry page");
    expect(withSource.text).toContain("Source:   Retail industry page");
    expect(renderEnquiryEmail(base).text).toContain("Source:   Talk to an expert form");
  });
});

describe("sitemap and robots", () => {
  it("lists the hub and every industry page on the canonical domain", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain("https://consultamerica.com/industries");
    for (const i of INDUSTRY_PAGES) expect(urls).toContain(`https://consultamerica.com/industries/${i.slug}`);
    expect(urls.every((u) => u.startsWith("https://consultamerica.com/"))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.some((u) => /\/(app|admin|candidate|login|api)(\/|$)/.test(new URL(u).pathname))).toBe(false);
  });

  it("blocks private areas without blocking public files that share a prefix", () => {
    const rules = robots().rules;
    const disallow = (Array.isArray(rules) ? rules[0] : rules).disallow as string[];
    expect(disallow).toEqual(expect.arrayContaining(["/admin", "/candidate", "/api/"]));
    // "/app" alone would also match /apple-icon.png.
    expect(disallow).not.toContain("/app");
  });
});
