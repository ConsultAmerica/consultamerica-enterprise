import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => createElement("a", { href, ...rest }, children as never),
}));

import { JobDetailView } from "@/components/jobs/JobDetailView";
import { assessJobCompleteness } from "@/lib/jobs/completeness";
import { CONSULTHIRE_BOT, buildJobSections, daysUntil, relatedJobs } from "@/lib/jobs/detail";
import { categoriesFor } from "@/lib/jobs/portal";
import type { Job } from "@/lib/jobs/public-model";

/** The production QA verification posting, verbatim (read-only audit, 2026-10-08). */
const QA_POSTING = {
  title: "Senior Oracle Fusion Financials Consultant",
  summary: "QA verification posting for the public careers portal (Oracle Fusion Financials).",
  description:
    "QA Portal Verification role — used to prove the public jobs pipeline.\nNot a customer-facing hiring campaign.\n\nConsult America is validating public job discovery, detail pages, and Easy Apply.\nThis posting may be unpublished after verification.",
  responsibilities: ["Support Oracle Fusion Financials design, configuration, and testing."],
  qualifications: ["Experience with Oracle Fusion Cloud Financials."],
  preferredQualifications: ["Oracle Cloud certification."],
};

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    slug: "senior-oracle-fusion-financials-consultant-qa-0142",
    department: "Oracle Consulting",
    careerArea: "technology-oracle" as Job["careerArea"],
    location: "Maryland",
    workplaceType: "Hybrid",
    employmentType: "Full Time",
    postedAt: "2026-10-05T17:27:33.157Z",
    status: "open",
    acceptingApplications: true,
    isNew: false,
    isDemo: false,
    requisitionId: "req-qa-0142",
    referenceNumber: "REQ-2026-0142",
    company: "Consult America",
    applicationType: "INTERNAL",
    skills: [],
    categories: [{ id: "oracle", label: "Oracle / ERP" }],
    verified: false,
    ...QA_POSTING,
    ...overrides,
  };
}

describe("job detail sections come only from the posting's own text", () => {
  it("Oracle Fusion Financials QA posting: no GL/AP/AR/FA/Cash Management/PPM is invented", () => {
    const s = buildJobSections(job());
    const names = s.skills.map((skill) => skill.name);
    expect(names).toEqual(expect.arrayContaining(["Oracle Fusion", "Oracle Financials"]));
    for (const absent of ["General Ledger", "Accounts Payable", "Accounts Receivable", "Fixed Assets", "Cash Management", "PPM", "OIC", "BI Publisher", "OTBI"]) {
      expect(names).not.toContain(absent);
    }
    // Every skill carries the posting snippet that proves it.
    for (const skill of s.skills) expect(QA_POSTING.description + QA_POSTING.responsibilities + QA_POSTING.qualifications + QA_POSTING.preferredQualifications).toContain(skill.evidence.split(" ")[0]);
    expect(s.responsibilities).toEqual(QA_POSTING.responsibilities);
    expect(s.required).toEqual(QA_POSTING.qualifications);
    expect(s.certifications).toEqual([{ text: "Oracle Cloud certification.", preferred: true }]);
    expect(s.preferred).toEqual([]); // regrouped under Certifications, not shown twice
    expect(s.education).toEqual([]);
    expect(s.minimumYears).toBeNull();
  });

  it("regroups education, certifications and years from the published lines", () => {
    const s = buildJobSections(
      job({
        qualifications: [
          "7+ years of Oracle Financials implementation experience.",
          "Bachelor's degree in Accounting or Finance.",
          "Hands-on General Ledger and Accounts Payable configuration.",
          "Oracle Cloud Financials certification.",
        ],
        preferredQualifications: ["Experience with OIC integrations."],
      }),
    );
    expect(s.minimumYears).toBe(7);
    expect(s.education).toEqual(["Bachelor's degree in Accounting or Finance."]);
    expect(s.certifications).toEqual([{ text: "Oracle Cloud Financials certification.", preferred: false }]);
    expect(s.required).toEqual(["7+ years of Oracle Financials implementation experience.", "Hands-on General Ledger and Accounts Payable configuration."]);
    expect(s.skills.map((k) => k.name)).toEqual(expect.arrayContaining(["General Ledger", "Accounts Payable", "OIC"]));
  });

  it("daysUntil and relatedJobs", () => {
    expect(daysUntil(undefined)).toBeNull();
    expect(daysUntil("2026-10-10T00:00:00Z", new Date("2026-10-08T00:00:00Z"))).toBe(2);
    const a = job({ id: "a", department: "Oracle Consulting" });
    const b = job({ id: "b", department: "Oracle Consulting", postedAt: "2026-10-06T00:00:00Z" });
    const c = job({ id: "c", department: "Data", categories: [{ id: "data", label: "Data" }] });
    const closed = job({ id: "d", acceptingApplications: false });
    expect(relatedJobs(a, [a, b, c, closed]).map((j) => j.id)).toEqual(["b"]);
  });
});

describe("publication readiness (recruiter workflow)", () => {
  it("flags the QA posting as incomplete and as test wording", () => {
    const r = assessJobCompleteness({ ...QA_POSTING, locationName: "Maryland" });
    expect(r.ready).toBe(false);
    const failed = r.checks.filter((c) => !c.ok).map((c) => c.id);
    expect(failed).toEqual(expect.arrayContaining(["description", "responsibilities", "qualifications", "placeholder"]));
  });

  it("passes a complete, approved-looking description", () => {
    const r = assessJobCompleteness({
      summary: "Lead Oracle Fusion Financials workstreams for enterprise finance teams across the full lifecycle.",
      description: "x".repeat(320),
      responsibilities: ["a", "b", "c"],
      qualifications: ["a", "b", "c"],
      preferredQualifications: [],
      locationName: "Maryland",
    });
    expect(r).toMatchObject({ ready: true });
  });
});

describe("job categories match whole words", () => {
  it("'ai' inside other words is not AI", () => {
    for (const text of ["Airflow data pipelines", "maintain the detail", "email campaigns"]) {
      expect(categoriesFor(text).map((c) => c.id)).not.toContain("ai-ml");
    }
    expect(categoriesFor("Senior AI Engineer").map((c) => c.id)).toContain("ai-ml");
    expect(categoriesFor("Generative AI and LLM apps").map((c) => c.id)).toContain("ai-ml");
  });

  it("Consulting, QA/Testing and Finance are word-based", () => {
    expect(categoriesFor("Senior Oracle Fusion Financials Consultant").map((c) => c.id)).toEqual(expect.arrayContaining(["oracle", "consulting"]));
    expect(categoriesFor("Consult America").map((c) => c.id)).not.toContain("consulting");
    expect(categoriesFor("QA Automation Engineer").map((c) => c.id)).toContain("qa");
    expect(categoriesFor("accountable delivery lead").map((c) => c.id)).not.toContain("finance");
  });
});

describe("Try Our New Bot replaces the Detailed application CTA", () => {
  const anchors = (html: string) => [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);

  for (const compact of [false, true]) {
    it(`${compact ? "listing preview" : "full detail page"}: Easy Apply primary, bot secondary, opened safely`, () => {
      const html = renderToStaticMarkup(createElement(JobDetailView, { job: job(), compact }));
      expect(html).not.toContain("Detailed application");
      expect(html).not.toContain("/apply/detailed");
      const easy = anchors(html).find((a) => a.includes(`href="/jobs/${job().slug}/apply"`));
      expect(easy).toContain("btn-primary");
      const bot = anchors(html).filter((a) => a.includes(CONSULTHIRE_BOT.href));
      expect(bot).toHaveLength(1);
      expect(bot[0]).toContain(`href="${CONSULTHIRE_BOT.href}"`); // exact URL: no query string, nothing about the visitor
      expect(bot[0]).toContain('target="_blank"');
      expect(bot[0]).toContain('rel="noopener noreferrer"');
      expect(bot[0]).not.toContain("btn-primary");
      expect(html).toContain("Try Our New Bot");
      expect(html).toContain("doesn&#x27;t submit an application");
    });
  }

  it("full page renders every available section and the reference number", () => {
    const html = renderToStaticMarkup(createElement(JobDetailView, { job: job({ closesAt: "2026-12-01T23:59:59.000Z" }) }));
    for (const heading of ["About the role", "Key responsibilities", "Required qualifications", "Technical and functional skills", "Certifications", "Hiring and application process"]) {
      expect(html).toContain(heading);
    }
    expect(html).toContain("REQ-2026-0142");
    expect(html).toContain("Closes");
    // Nothing published → no compensation section and no invented education.
    expect(html).not.toContain("Compensation");
    expect(html).not.toContain("Experience and education");
    // The full description renders untruncated.
    expect(html).toContain("This posting may be unpublished after verification.");
  });

  it("closed role: no apply or bot CTA", () => {
    const html = renderToStaticMarkup(createElement(JobDetailView, { job: job({ acceptingApplications: false }) }));
    expect(html).toContain("no longer accepting applications");
    expect(html).not.toContain(CONSULTHIRE_BOT.href);
    expect(html).not.toContain("/apply\"");
  });
});
