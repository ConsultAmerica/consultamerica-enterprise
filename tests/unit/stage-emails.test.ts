import { describe, expect, it } from "vitest";

import { renderStageEmail, stageEmailApplies } from "@/lib/email/stage-emails";
import { APPLICATION_STATUSES } from "@/lib/neon/types";

/**
 * The stage notifications.
 *
 * WHAT THESE TESTS PROTECT. These are sent automatically, to members of the
 * public, about decisions concerning them, and they cannot be recalled. The
 * risk is not that one fails to render. It is that somebody adds an
 * encouraging sentence that turns a stage change into a promise: a date nobody
 * has set, an interview nobody has booked, or an offer nobody has approved.
 * Most of what is below is a list of sentences that must not appear.
 */

const now = new Date("2026-10-13T15:00:00Z");

const input = {
  candidateName: "Dana Whitfield",
  candidateEmail: "delivered@resend.dev",
  jobTitle: "Oracle HCM Analyst",
};

const EMAILED = ["SCREENING", "INTERVIEW", "SHORTLISTED", "OFFER", "HIRED"] as const;

function bodies(status: (typeof EMAILED)[number]) {
  const r = renderStageEmail(status, input, { now });
  if (!r) throw new Error(`${status} rendered nothing`);
  return { ...r, both: `${r.html}\n${r.text}` };
}

describe("which stages write to the candidate", () => {
  it("covers the five progress stages", () => {
    for (const status of EMAILED) {
      expect(stageEmailApplies(status)).toBe(true);
      expect(renderStageEmail(status, input, { now })).not.toBeNull();
    }
  });

  /**
   * NEW is what the application confirmation already said minutes earlier, and
   * WITHDRAWN is the candidate's own decision, which they do not need
   * announcing back to them. REJECTED is handled by its own renderer in
   * application-emails.ts, so it is absent here on purpose: two templates for
   * one message is how the tone drifts between them.
   */
  it("stays silent on NEW, WITHDRAWN and REJECTED", () => {
    for (const status of ["NEW", "WITHDRAWN", "REJECTED"] as const) {
      expect(stageEmailApplies(status)).toBe(false);
      expect(renderStageEmail(status, input, { now })).toBeNull();
    }
  });

  it("accounts for every status in the schema", () => {
    // So a stage added to the CHECK list later cannot quietly default to
    // sending nothing without somebody deciding that is right.
    const handled = new Set<string>([...EMAILED, "NEW", "WITHDRAWN", "REJECTED"]);
    for (const status of APPLICATION_STATUSES) {
      expect(handled.has(status)).toBe(true);
    }
  });
});

describe("what every stage email says", () => {
  for (const status of EMAILED) {
    it(`${status}: names the person and the role, in both formats`, () => {
      const { subject, html, text } = bodies(status);
      expect(subject).toContain("Oracle HCM Analyst");
      for (const body of [html, text]) {
        expect(body).toContain("Dana");
        expect(body).toContain("Oracle HCM Analyst");
      }
    });

    it(`${status}: signs off as the team`, () => {
      const { html, text } = bodies(status);
      for (const body of [html, text]) {
        expect(body).toContain("Talent Acquisition Team");
        expect(body).toContain("Consult America Inc.");
      }
    });

    it(`${status}: promises no date, deadline or duration`, () => {
      // Nothing in this system knows one, so any of these would be invented.
      const { both } = bodies(status);
      for (const forbidden of [
        "within 24",
        "within 48",
        "business days",
        "next week",
        "tomorrow",
        "by Friday",
        "in the coming days",
      ]) {
        expect(both.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
    });

    it(`${status}: quotes no score or internal identifier`, () => {
      const { both } = bodies(status);
      for (const forbidden of ["score", "/10", "ConsultHire", "APP-", "/admin/"]) {
        expect(both).not.toContain(forbidden);
      }
    });

    it(`${status}: uses no em dash`, () => {
      expect(bodies(status).both).not.toContain("—");
    });
  }
});

describe("the promises each stage is not allowed to make", () => {
  it("Screening does not imply an interview", () => {
    const { both } = bodies("SCREENING");
    expect(both.toLowerCase()).not.toContain("interview");
  });

  it("Shortlisted does not book anything", () => {
    const { both } = bodies("SHORTLISTED");
    expect(both.toLowerCase()).not.toContain("scheduled");
    expect(both.toLowerCase()).not.toContain("your interview is");
  });

  /**
   * The sharpest case in this file. An offer is a document somebody has to
   * approve and sign. A candidate who resigns from their job on the strength
   * of an automated stage change has been misled by us, not by their own
   * optimism, so this stage has to say out loud that nothing is confirmed yet.
   */
  it("Offer says nothing is confirmed until it is in writing", () => {
    const { both } = bodies("OFFER");
    expect(both).toContain("formal written offer");
    expect(both.toLowerCase()).toContain("nothing is confirmed");
    // Must not read as the offer itself.
    expect(both.toLowerCase()).not.toContain("we are pleased to offer");
    expect(both.toLowerCase()).not.toContain("your offer is attached");
    expect(both).not.toContain("salary");
    expect(both).not.toContain("compensation");
  });

  it("Hired confirms rather than congratulating on an offer", () => {
    const { both } = bodies("HIRED");
    expect(both.toLowerCase()).toContain("confirmed");
    expect(both.toLowerCase()).toContain("onboarding");
  });
});

describe("escaping", () => {
  it("escapes a name and a job title containing markup", () => {
    const rendered = renderStageEmail(
      "SHORTLISTED",
      {
        ...input,
        candidateName: "<script>alert(1)</script> Whitfield",
        jobTitle: "Analyst <img src=x onerror=1>",
      },
      { now },
    );
    expect(rendered).not.toBeNull();
    expect(rendered!.html).not.toContain("<script>");
    expect(rendered!.html).not.toContain("<img src=x");
    expect(rendered!.html).toContain("&lt;script&gt;");
  });
});
