import { afterEach, describe, expect, it } from "vitest";

import {
  renderApplicationConfirmation,
  renderApplicationNotification,
  renderRejectionNotice,
} from "@/lib/email/application-emails";
import {
  renderInterviewCompletedNotification,
  renderSecondRoundInvitation,
} from "@/lib/email/interview-emails";

/**
 * The Neon console link in recruitment email, and the line it must not cross.
 *
 * WHY THIS FILE EXISTS. Two of these four templates go to the recruiting
 * inbox and two go to the candidate, and they share their header, button,
 * shell and footer so that messages about one application read as one product.
 * That sharing is exactly what makes a mistake here cheap to introduce: a
 * fragment added to the wrong helper, or a helper called from the wrong
 * render function, puts an internal link into a message addressed to a member
 * of the public. Nothing in the type system distinguishes the two, so this is
 * the thing holding the line.
 *
 * The internal link is not a credential, and that is not the point. It names
 * the database and the record and tells an outsider where the recruiting data
 * lives, and a candidate has no reason to be told any of it.
 *
 * These tests render. They do not read the source for a call site, because a
 * call site can be correct while the fragment reaches the body some other way.
 */

const APPLICATION_ID = "9f1c2b7e-4d5a-4f18-9c0e-71a3d6b85e42";

const LOCAL =
  "postgresql://neondb_owner:npg_FAKEpassword123@ep-fake-endpoint-a1b2c3d4-pooler.us-east-1.aws.neon.tech/ca_localdev?sslmode=require";
const PRODUCTION =
  "postgresql://neondb_owner:npg_FAKEpassword123@ep-fake-endpoint-a1b2c3d4-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require";

const ORIGINAL = {
  DATABASE_URL: process.env.DATABASE_URL,
  POSTGRES_URL: process.env.POSTGRES_URL,
};

function connectTo(url: string | undefined) {
  if (url === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = url;
  delete process.env.POSTGRES_URL;
}

afterEach(() => {
  if (ORIGINAL.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL.DATABASE_URL;
  if (ORIGINAL.POSTGRES_URL === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = ORIGINAL.POSTGRES_URL;
});

/** A fixed date so a rendered stamp cannot make a test flap. */
const now = new Date("2026-10-12T15:00:00Z");

const applicationInput = {
  candidateName: "Dana Whitfield",
  candidateEmail: "delivered@resend.dev",
  candidatePhone: "+1 555 0100",
  jobTitle: "Oracle HCM Analyst",
  applicationId: APPLICATION_ID,
  applicationNumber: "APP-2026-0010",
  source: "Careers Site",
  resumeFilename: "dana-whitfield.pdf",
};

const interviewInput = {
  candidateName: "Dana Whitfield",
  candidateEmail: "delivered@resend.dev",
  jobTitle: "Oracle HCM Analyst",
  applicationId: APPLICATION_ID,
  applicationNumber: "APP-2026-0010",
  score: 8.5,
  verdict: "Strong functional background.",
  report: null,
  secondRoundEligible: true,
};

const secondRoundInput = {
  candidateName: "Dana Whitfield",
  candidateEmail: "delivered@resend.dev",
  jobTitle: "Oracle HCM Analyst",
  applicationNumber: "APP-2026-0010",
  recruiterName: "A Recruiter",
};

/** Everything a reader of the message could see, HTML and text together. */
function bodies(rendered: { html: string; text: string }) {
  return `${rendered.html}\n${rendered.text}`;
}

describe("candidate-facing email never carries an internal link", () => {
  /*
    Rendered against a production connection string on purpose. That is the
    configuration in which a leak would be worst and in which the link
    builders are most willing to produce a URL, so a template that is clean
    here is clean everywhere.
  */
  const candidateTemplates = [
    {
      name: "application confirmation",
      render: () => renderApplicationConfirmation(applicationInput, { now }),
    },
    {
      name: "second round invitation",
      render: () => renderSecondRoundInvitation(secondRoundInput, { now }),
    },
    {
      name: "rejection notice",
      render: () => renderRejectionNotice(applicationInput, { now }),
    },
  ];

  for (const template of candidateTemplates) {
    it(`${template.name} mentions no console, database or record id`, () => {
      connectTo(PRODUCTION);
      const body = bodies(template.render());

      for (const forbidden of [
        "console.neon.tech",
        "Neon",
        "neon",
        "neondb",
        "ca_localdev",
        "lively-dew-34491258",
        "sql-editor",
        "SELECT",
        APPLICATION_ID,
      ]) {
        expect(body).not.toContain(forbidden);
      }
    });
  }
});

describe("internal notification carries the link", () => {
  const internalTemplates = [
    {
      name: "application notification",
      render: () => renderApplicationNotification(applicationInput, { now }),
    },
    {
      name: "interview completed notification",
      render: () => renderInterviewCompletedNotification(interviewInput, { now }),
    },
  ];

  for (const template of internalTemplates) {
    it(`${template.name} names the database it points at`, () => {
      connectTo(LOCAL);
      const body = bodies(template.render());
      expect(body).toContain("console.neon.tech");
      expect(body).toContain("ca_localdev");
      expect(body).toContain(APPLICATION_ID);
    });

    it(`${template.name} says so when the link points at production`, () => {
      // A recruiter opening a console link has to know whether they are about
      // to look at real candidates. Silence here is the failure mode.
      connectTo(PRODUCTION);
      const body = bodies(template.render());
      expect(body).toContain("neondb");
      expect(body.toLowerCase()).toContain("production");
    });

    it(`${template.name} omits the link when no database is configured`, () => {
      connectTo(undefined);
      const body = bodies(template.render());
      expect(body).not.toContain("console.neon.tech");
      // The rest of the message still has to work without it.
      expect(body).toContain("APP-2026-0010");
    });

    it(`${template.name} carries no SQL, which belongs in the dashboard only`, () => {
      connectTo(LOCAL);
      const body = bodies(template.render());
      expect(body).not.toContain("SELECT");
      expect(body).not.toContain("WHERE id =");
    });

    it(`${template.name} carries no credential from the connection string`, () => {
      connectTo(PRODUCTION);
      const body = bodies(template.render());
      for (const secret of [
        "npg_FAKEpassword123",
        "neondb_owner",
        "ep-fake-endpoint-a1b2c3d4-pooler",
        "aws.neon.tech",
        "sslmode",
      ]) {
        expect(body).not.toContain(secret);
      }
    });
  }
});

describe("the dashboard link and the resume link are untouched", () => {
  it("keeps both on the application notification", () => {
    // The primary actions. The Neon link is secondary to these, and a
    // regression that removed either while adding it would be a downgrade
    // dressed as a feature.
    connectTo(LOCAL);
    const body = bodies(renderApplicationNotification(applicationInput, { now }));
    expect(body).toContain(`/admin/applications/${APPLICATION_ID}`);
    expect(body).toContain(`/admin/applications/${APPLICATION_ID}/resume`);
  });

  it("keeps the dashboard link on the interview notification", () => {
    connectTo(LOCAL);
    const body = bodies(renderInterviewCompletedNotification(interviewInput, { now }));
    expect(body).toContain(`/admin/applications/${APPLICATION_ID}`);
  });
});
