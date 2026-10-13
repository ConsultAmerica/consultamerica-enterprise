/**
 * Seeds the recruitment database with Consult America's open roles.
 *
 * WHY A SCRIPT AND NOT SQL. createJob allocates the slug and the CA-YYYY-NNNN
 * reference under an advisory lock, and writes them in one transaction. Hand
 * written INSERTs would have to reimplement both and would eventually hand two
 * jobs the same number.
 *
 * ca_localdev ONLY. The database name is asserted before anything is written,
 * so a changed DATABASE_URL cannot put seed data in front of real candidates.
 *
 *   npm run seed:jobs
 *
 * Safe to re-run: it refuses rather than duplicating if jobs already exist.
 */

import { readFileSync } from "node:fs";

/*
  .env.local, loaded by hand. Node 20 has no --env-file support in the runner
  this script uses, and the alternative is asking whoever runs it to export six
  variables first. Only keys that are not already set are applied, so a value
  passed on the command line still wins.
*/
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
}

const { createJob } = await import("@/lib/neon/jobs");
const { db } = await import("@/lib/neon/client");

/**
 * Every role is Hagerstown, MD and on site, and every band sits inside
 * 80,000 to 120,000. The bands differ by role within that: a lead carries more
 * than an analyst, and publishing one flat number across six different jobs
 * would tell a candidate nothing and would not survive their first question.
 */
const JOBS = [
  {
    title: "Oracle Cloud ERP Analyst",
    department: "Oracle Cloud",
    experienceLevel: "Mid level",
    salaryMin: 95_000,
    salaryMax: 120_000,
    description:
      "Configure and support Oracle Cloud ERP for client finance teams, from requirements through go-live and into steady-state support. You will sit with the people who use the system every day and translate how they work into how it is configured.",
    responsibilities: [
      "Configure Oracle Cloud Financials modules against documented client requirements",
      "Run requirement-gathering sessions with finance and operations stakeholders",
      "Write functional specifications and hand them to the technical team",
      "Build and execute test scripts for each release, and record the results",
      "Support users through go-live and the first close after it",
    ],
    requirements: [
      "3+ years working with Oracle Cloud ERP or Oracle E-Business Suite",
      "Hands-on configuration of at least two Financials modules",
      "Experience writing functional specifications and test scripts",
      "Able to explain a system change to someone who does not work in IT",
      "Bachelor's degree in Accounting, Information Systems or equivalent experience",
    ],
    benefits: [
      "Health, dental and vision from day one",
      "401(k) with company match",
      "Paid Oracle certification and exam fees",
      "15 days paid time off plus federal holidays",
    ],
  },
  {
    title: "Oracle EBS Functional Lead",
    department: "Oracle Cloud",
    experienceLevel: "Senior",
    salaryMin: 105_000,
    salaryMax: 120_000,
    description:
      "Lead Oracle E-Business Suite work across client engagements: own the functional design, guide the analysts doing the configuration, and be the person the client calls when something in the process does not add up.",
    responsibilities: [
      "Own functional design across Oracle EBS Financials and Supply Chain",
      "Lead a team of two to four analysts through configuration and testing",
      "Run design workshops and hold the line on scope",
      "Review functional specifications before they reach the technical team",
      "Plan and rehearse cutover for each go-live",
    ],
    requirements: [
      "6+ years with Oracle E-Business Suite in a functional role",
      "Led at least one full implementation or major upgrade end to end",
      "Deep knowledge of two or more EBS modules",
      "Experience managing client expectations directly, not through a layer",
      "Bachelor's degree or equivalent experience",
    ],
    benefits: [
      "Health, dental and vision from day one",
      "401(k) with company match",
      "Paid certification and conference attendance",
      "20 days paid time off plus federal holidays",
    ],
  },
  {
    title: "Data Engineer",
    department: "AI & Data",
    experienceLevel: "Mid level",
    salaryMin: 95_000,
    salaryMax: 120_000,
    description:
      "Build the pipelines that move client data from the systems that produce it to the places people make decisions in. Most of this work is making unreliable sources reliable, and making it obvious when they are not.",
    responsibilities: [
      "Build and maintain ETL pipelines across client source systems",
      "Model data for reporting and analysis in a cloud warehouse",
      "Add monitoring and alerting so a broken feed is noticed before a user reports it",
      "Document each pipeline well enough that someone else can fix it at 2am",
      "Work with analysts to turn recurring questions into scheduled datasets",
    ],
    requirements: [
      "3+ years building production data pipelines",
      "Strong SQL, and Python or Scala",
      "Experience with a cloud warehouse such as Snowflake, BigQuery or Redshift",
      "Comfortable with version control and code review as a normal part of the job",
      "Bachelor's degree in Computer Science or equivalent experience",
    ],
    benefits: [
      "Health, dental and vision from day one",
      "401(k) with company match",
      "Annual learning budget",
      "15 days paid time off plus federal holidays",
    ],
  },
  {
    title: "AI Solutions Engineer",
    department: "AI & Data",
    experienceLevel: "Mid level",
    salaryMin: 100_000,
    salaryMax: 120_000,
    description:
      "Take AI from something a client has read about to something running in their business. You will scope what is actually worth automating, build it, and be honest about what the model can and cannot be trusted to do.",
    responsibilities: [
      "Build and ship applications backed by large language models",
      "Design retrieval and evaluation so answers can be checked rather than assumed",
      "Integrate models with existing client systems and data",
      "Measure accuracy and cost against a baseline, and report both",
      "Explain to non-technical stakeholders where a model should not be used",
    ],
    requirements: [
      "3+ years in software engineering, with recent production LLM work",
      "Strong Python, and working knowledge of TypeScript or Java",
      "Experience with embeddings, retrieval and prompt evaluation",
      "Able to say no to an AI use case that does not warrant one",
      "Bachelor's degree in a technical field or equivalent experience",
    ],
    benefits: [
      "Health, dental and vision from day one",
      "401(k) with company match",
      "Annual learning budget and conference travel",
      "15 days paid time off plus federal holidays",
    ],
  },
  {
    title: "Full-Stack Engineer",
    department: "Engineering",
    experienceLevel: "Mid level",
    salaryMin: 90_000,
    salaryMax: 115_000,
    description:
      "Build and run the web applications Consult America delivers for clients, front to back. Small teams, direct client contact, and you own what you ship through to production.",
    responsibilities: [
      "Build features across the stack in TypeScript and React",
      "Design and query relational databases",
      "Write tests that cover the behaviour, not just the lines",
      "Review other engineers' code and have yours reviewed",
      "Support what you build once it is live",
    ],
    requirements: [
      "3+ years building production web applications",
      "Strong TypeScript and React, and a server-side framework",
      "Comfortable with SQL and schema design",
      "Experience with CI and automated testing",
      "Bachelor's degree in Computer Science or equivalent experience",
    ],
    benefits: [
      "Health, dental and vision from day one",
      "401(k) with company match",
      "Annual learning budget",
      "15 days paid time off plus federal holidays",
    ],
  },
  {
    title: "Business Systems Analyst",
    department: "Enterprise Transformation",
    experienceLevel: "Mid level",
    salaryMin: 80_000,
    salaryMax: 105_000,
    description:
      "Sit between the client's business and the people building their systems. You will find out how the work is really done, write it down clearly enough to build from, and make sure what gets delivered is what was needed.",
    responsibilities: [
      "Gather and document requirements from business stakeholders",
      "Map current processes and propose where the system should change",
      "Write user stories and acceptance criteria the delivery team can build from",
      "Coordinate user acceptance testing and track what it finds",
      "Produce training material and run sessions for end users",
    ],
    requirements: [
      "2+ years as a business analyst on technology projects",
      "Able to write a requirement that two people read the same way",
      "Comfortable running a workshop with people who disagree",
      "Working knowledge of SQL for checking data yourself",
      "Bachelor's degree in Business, Information Systems or equivalent experience",
    ],
    benefits: [
      "Health, dental and vision from day one",
      "401(k) with company match",
      "Tuition assistance",
      "15 days paid time off plus federal holidays",
    ],
  },
  {
    title: "QA Automation Engineer",
    department: "Engineering",
    experienceLevel: "Mid level",
    salaryMin: 85_000,
    salaryMax: 110_000,
    description:
      "Own the automated testing that lets client releases ship without a week of manual regression. The goal is a suite people trust: when it is green the release goes, and when it is red there is a real bug behind it.",
    responsibilities: [
      "Build and maintain end-to-end and API test suites",
      "Wire the suites into CI so every change is checked before merge",
      "Investigate and fix flaky tests rather than retrying them",
      "Write clear reproduction steps for the defects you find",
      "Work with engineers on what should be tested at which level",
    ],
    requirements: [
      "3+ years in test automation",
      "Experience with a modern framework such as Playwright, Cypress or Selenium",
      "Strong scripting in TypeScript, Python or Java",
      "Experience testing REST APIs and reading a failing CI log",
      "Bachelor's degree in a technical field or equivalent experience",
    ],
    benefits: [
      "Health, dental and vision from day one",
      "401(k) with company match",
      "Annual learning budget",
      "15 days paid time off plus federal holidays",
    ],
  },
  {
    title: "Technical Recruiter",
    department: "People",
    experienceLevel: "Mid level",
    salaryMin: 80_000,
    salaryMax: 100_000,
    description:
      "Find and hire the consultants Consult America puts in front of clients. You will own roles end to end, from understanding what a delivery lead actually needs to the candidate's first day.",
    responsibilities: [
      "Own technical requisitions from intake through offer",
      "Source candidates directly rather than waiting on inbound applications",
      "Screen for technical fit well enough to brief a hiring manager accurately",
      "Keep candidates informed at every stage, including when the answer is no",
      "Report on pipeline health and time to hire",
    ],
    requirements: [
      "3+ years recruiting technical roles, agency or in-house",
      "Able to hold a credible conversation about an engineer's work",
      "Experience with an applicant tracking system",
      "Track record of filling hard roles, with the numbers to show it",
      "Bachelor's degree or equivalent experience",
    ],
    benefits: [
      "Health, dental and vision from day one",
      "401(k) with company match",
      "Performance bonus tied to placements",
      "15 days paid time off plus federal holidays",
    ],
  },
] as const;

async function main() {
  const rows = await db.query<{ db: string }>("SELECT current_database() AS db");
  const name = rows[0]?.db;
  if (name !== "ca_localdev") {
    console.error(`Refusing to seed: connected to ${name}, expected ca_localdev.`);
    process.exit(1);
  }

  const existing = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM jobs");
  if ((existing[0]?.n ?? 0) > 0) {
    console.error(
      `Refusing to seed: ${existing[0].n} jobs already exist. Clear them first if you meant to start over.`,
    );
    process.exit(1);
  }

  console.log(`seeding ${JOBS.length} jobs into ${name}\n`);

  for (const job of JOBS) {
    const created = await createJob(
      {
        ...job,
        location: "Hagerstown, MD",
        workplaceType: "ONSITE",
        employmentType: "FULL_TIME",
        salaryCurrency: "USD",
        responsibilities: [...job.responsibilities],
        requirements: [...job.requirements],
        benefits: [...job.benefits],
        // Published, because a seeded job nobody can see does not let you test
        // the careers page, the apply flow or anything downstream of them.
        status: "PUBLISHED",
      },
      null,
    );
    console.log(
      `  ${created.reference}  $${(job.salaryMin / 1000).toFixed(0)}k-${(job.salaryMax / 1000).toFixed(0)}k  ${created.title}`,
    );
  }

  console.log(`\ndone. All on site in Hagerstown, MD, all published.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
