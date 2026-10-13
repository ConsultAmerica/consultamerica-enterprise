import { describe, expect, it } from "vitest";

import { renderRejectionNotice } from "@/lib/email/application-emails";

/**
 * The rejection email.
 *
 * WHAT THESE TESTS ARE PROTECTING. This is the one message in the system that
 * is sent automatically, to a member of the public, about a decision that went
 * against them, and it cannot be recalled. The risk is not that it fails to
 * render; it is that somebody later adds a helpful-sounding sentence to it.
 * Every assertion below is a sentence that must not appear.
 *
 * The score is the sharpest case. An AI interview produces a number that is a
 * model's judgement of a person, and a candidate reading "you scored 6.2"
 * would reasonably treat it as a grade to argue with. The second-round
 * invitation already refuses to quote one and this refuses for the same
 * reason.
 */

const now = new Date("2026-10-12T15:00:00Z");

const input = {
  candidateName: "Dana Whitfield",
  candidateEmail: "delivered@resend.dev",
  jobTitle: "Oracle HCM Analyst",
  applicationId: "9f1c2b7e-4d5a-4f18-9c0e-71a3d6b85e42",
  applicationNumber: "APP-2026-0010",
};

function bodies() {
  const r = renderRejectionNotice(input, { now });
  return { ...r, both: `${r.html}\n${r.text}` };
}

describe("what the rejection says", () => {
  it("names the person and the role, and renders both formats", () => {
    const { subject, html, text } = bodies();
    expect(subject).toBe("Update on your application: Oracle HCM Analyst");
    for (const body of [html, text]) {
      expect(body).toContain("Oracle HCM Analyst");
      expect(body).toContain("Dana");
    }
  });

  it("says the decision plainly, once", () => {
    // Plainly, because a rejection that will not say what it is makes the
    // reader hunt for it. Once, because repeating it is unkind rather than
    // clear.
    const { text } = bodies();
    const occurrences = text.split("not to move forward with your").length - 1;
    expect(occurrences).toBe(1);
  });

  it("signs off as a team, not as the system", () => {
    // A decision about a person should come from people. An unsigned
    // rejection reads as something a process emitted.
    const { html, text } = bodies();
    for (const body of [html, text]) {
      expect(body).toContain("Talent Acquisition Team");
      expect(body).toContain("Consult America Inc.");
    }
  });

  /**
   * The reference number and the "See our open roles" button were both removed
   * on request, and both for the same reason: they were lifted from the
   * confirmation email, where somebody who has just applied genuinely needs a
   * number to quote and a reason to keep looking. Attached to a rejection the
   * number is an admin detail for a record the reader is finished with, and the
   * button reads as a pitch stapled to a no.
   */
  it("carries no reference number and no call to action", () => {
    const { both } = bodies();
    expect(both).not.toContain("APP-2026-0010");
    expect(both.toLowerCase()).not.toContain("reference");
    expect(both).not.toContain("/careers");
    expect(both).not.toContain("See our open roles");
  });

  it("is three paragraphs and a signature, with no decorative blocks", () => {
    // Guards the strip-back. The confirmation's reference card is a nested
    // table; if one reappears here the markup gets measurably heavier.
    const { html } = bodies();
    const tables = (html.match(/<table/g) || []).length;
    expect(tables).toBeLessThanOrEqual(4);
  });
});

describe("what the rejection must never say", () => {
  it("quotes no score, verdict or interview assessment", () => {
    const { both } = bodies();
    for (const forbidden of [
      "score",
      "Score",
      "verdict",
      "Verdict",
      "/10",
      "recommendation",
      "Recommendation",
      "confidence",
      "Confidence",
      "AI interview",
      "ConsultHire",
    ]) {
      expect(both).not.toContain(forbidden);
    }
  });

  it("carries no internal identifier or database link", () => {
    // Everything the internal notification is allowed to carry and this is
    // not. The application id is the sharpest: it is the key to the record.
    const { both } = bodies();
    for (const forbidden of [
      input.applicationId,
      "console.neon.tech",
      "neon",
      "Neon",
      "ca_localdev",
      "neondb",
      "SELECT",
      "/admin/",
    ]) {
      expect(both).not.toContain(forbidden);
    }
  });

  it("makes no promise the business has not made", () => {
    // Each of these is a commitment somebody would have to honour. "We will
    // keep your CV on file" is a data-retention claim; "we were impressed" is
    // a judgement nobody made; a named reason invites a reply arguing it.
    const { both } = bodies();
    for (const forbidden of [
      "on file",
      "keep your",
      "future roles",
      "impressed",
      "strong candidate",
      "unfortunately we",
      "disappointing",
      "better fit",
      "more experience",
    ]) {
      expect(both.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("uses no em dash, which is a house rule for every word that ships", () => {
    const { both } = bodies();
    expect(both).not.toContain("—");
  });
});

describe("escaping", () => {
  it("escapes a name that contains markup", () => {
    // The name came off a public form. It is the candidate's own text and is
    // treated as hostile everywhere else in this file.
    const rendered = renderRejectionNotice(
      { ...input, candidateName: "<script>alert(1)</script> Whitfield" },
      { now },
    );
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
  });

  it("escapes a job title that contains markup", () => {
    const rendered = renderRejectionNotice(
      { ...input, jobTitle: "Analyst <img src=x onerror=1>" },
      { now },
    );
    expect(rendered.html).not.toContain("<img src=x");
  });
});
