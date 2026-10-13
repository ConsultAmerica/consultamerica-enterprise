import { describe, expect, it } from "vitest";

import { categoriesFor } from "@/lib/jobs/portal";

/**
 * How a posting is filed on the jobs portal.
 *
 * WHY THESE ARE PINNED. Categories are derived from text by regular
 * expression, which fails in a quiet way: a job appears under a heading that
 * is merely plausible, nobody notices, and a candidate filtering for their
 * discipline is shown work they did not ask for. Every case below is one that
 * was actually wrong on the live site on 2026-10-13.
 *
 * The rule the taxonomy follows: a category describes what the role IS, not
 * what its description MENTIONS. A job description names the tools nearby,
 * the people you sit with and the systems you touch, and none of those are the
 * job.
 */

const ROLES = [
  ["Computer Systems Analyst", "Information Technology"],
  ["Software Developer", "Software Engineering"],
  ["Automation Test Engineer", "Quality Assurance & Testing"],
  ["Data Engineer", "Data Engineering & Analytics"],
  ["Oracle ERP Consultant", "Enterprise Applications"],
  ["Oracle SCM Cloud Consultant", "Enterprise Applications"],
] as const;

function labels(title: string, department: string): string[] {
  return categoriesFor(`${title} ${department}`).map((c) => c.label);
}

describe("the six live postings land in the right categories", () => {
  it("Computer Systems Analyst is business analysis, not CRM or operations", () => {
    // Was: CRM, Operations / Administration. Both came from passing mentions
    // of ERP and CRM systems in the preferred qualifications, and from the
    // phrase "business operations" in the opening line.
    const l = labels("Computer Systems Analyst", "Information Technology");
    expect(l).toContain("Business Analysis");
    expect(l).not.toContain("CRM");
    expect(l).not.toContain("Operations / Administration");
  });

  it("Software Developer is software engineering only", () => {
    // Was also Business Analysis, because the description says you work with
    // business analysts.
    expect(labels("Software Developer", "Software Engineering")).toEqual(["Software Engineering"]);
  });

  it("Automation Test Engineer is QA, not software engineering", () => {
    const l = labels("Automation Test Engineer", "Quality Assurance & Testing");
    expect(l).toContain("QA / Testing");
    expect(l).not.toContain("Software Engineering");
  });

  it("Data Engineer is data, not software engineering", () => {
    // The one that prompted this fix. A bare \\bengineer\\b in the software
    // pattern swept up every engineer on the board.
    const l = labels("Data Engineer", "Data Engineering & Analytics");
    expect(l).toContain("Data & Analytics");
    expect(l).not.toContain("Software Engineering");
  });

  it("Oracle roles are Oracle and consulting, never Cloud / DevOps", () => {
    // "Oracle SCM Cloud Consultant" contains the word Cloud because Oracle
    // names half its suite Cloud. It is not an infrastructure role.
    for (const title of ["Oracle ERP Consultant", "Oracle SCM Cloud Consultant"]) {
      const l = labels(title, "Enterprise Applications");
      expect(l).toContain("Oracle / ERP");
      expect(l).toContain("Consulting");
      expect(l).not.toContain("Cloud / DevOps");
    }
  });

  it("gives every live posting at least one category", () => {
    // A posting with none is unreachable from the category rail, which is how
    // Computer Systems Analyst would have ended up invisible to anyone
    // browsing by discipline.
    for (const [title, department] of ROLES) {
      expect(labels(title, department).length).toBeGreaterThan(0);
    }
  });
});

describe("the tightened patterns still catch what they should", () => {
  it("real cloud and devops roles are still Cloud / DevOps", () => {
    for (const title of ["Cloud Engineer", "DevOps Engineer", "Platform Engineer", "Site Reliability Engineer"]) {
      expect(labels(title, "Engineering")).toContain("Cloud / DevOps");
    }
  });

  it("real software roles are still Software Engineering", () => {
    for (const title of ["Software Engineer", "Full Stack Developer", "Frontend Developer", "Backend Engineer"]) {
      expect(labels(title, "Engineering")).toContain("Software Engineering");
    }
  });
});
