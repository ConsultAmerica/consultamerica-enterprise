/**
 * The six Hagerstown roles, as supplied by Haseeb Kalwar on 2026-10-12.
 *
 * CREATED AS DRAFTS, NOT PUBLISHED. The source brief says "Draft (until
 * approved)" and asks that experience requirements, salary ranges and whether
 * a degree is mandatory be confirmed before publishing. A draft is visible in
 * the dashboard and invisible to candidates, which is exactly the state those
 * open questions call for.
 *
 * SALARY AND EXPERIENCE ARE DELIBERATELY ABSENT. The brief records both as
 * "Not specified". Inventing a band to fill the field would put a number in
 * front of a candidate that nobody at the company has agreed to.
 *
 * Every role is Hagerstown, MD and 100% onsite, per the brief.
 *
 *   npm run seed:hagerstown           ca_localdev
 *   npm run seed:hagerstown -- --prod neondb, the live careers database
 *
 * Re-running is safe: a title that already exists is skipped, not duplicated.
 */

import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
}

const wantProd = process.argv.includes("--prod");
if (wantProd) {
  process.env.DATABASE_URL = (process.env.DATABASE_URL ?? "").replace("/ca_localdev", "/neondb");
}

const { createJob } = await import("@/lib/neon/jobs");
const { db } = await import("@/lib/neon/client");

const ROLES = [
  {
    title: "Computer Systems Analyst",
    department: "Information Technology",
    description:
      "Consult America is seeking a detail-oriented Computer Systems Analyst to evaluate, design, and optimize information systems that support business operations. You will work with business stakeholders, technical teams and management to identify system requirements, improve workflows, and implement reliable technology solutions.",
    responsibilities: [
      "Analyse existing computer systems, business processes and technical requirements to identify improvement opportunities",
      "Gather and document functional and technical requirements from stakeholders",
      "Design system enhancements and recommend technology solutions that improve operational efficiency",
      "Work with software developers, database administrators and IT teams to implement system improvements",
      "Perform system testing, troubleshooting and performance analysis",
      "Produce technical documentation, workflow diagrams and system specifications",
      "Support system integration, data migration and implementation activities",
      "Make sure systems meet the organisation's security, performance and reliability standards",
    ],
    requirements: [
      "Bachelor's degree in Information Technology, Computer Science, Information Systems or a related field, required",
      "Knowledge of computer systems, software applications, databases and IT infrastructure",
      "Experience analysing business processes and translating requirements into technical solutions",
      "Familiarity with SQL, system documentation and troubleshooting methodologies",
      "Strong analytical, problem-solving and communication skills",
      "Able to work with technical and non-technical stakeholders",
      "Preferred: experience with ERP, CRM or other enterprise business applications",
      "Preferred: familiarity with AWS or Azure, Agile methodologies, SDLC and business process modelling",
    ],
  },
  {
    title: "Software Developer",
    department: "Software Engineering",
    description:
      "Consult America is seeking a Software Developer to design, develop, test and maintain high-quality software applications. You will work with engineering teams, business analysts and stakeholders to deliver scalable, secure and reliable software that meets real business requirements.",
    responsibilities: [
      "Design, develop and maintain software applications using modern languages and frameworks",
      "Write clean, maintainable, efficient and well-documented code",
      "Work with cross-functional teams to define software requirements and technical specifications",
      "Develop and integrate APIs, backend services and database solutions",
      "Debug applications, resolve defects and optimise performance",
      "Take part in code reviews, unit testing, integration testing and deployment",
      "Maintain technical documentation and follow established development standards",
      "Support software enhancements, maintenance and production troubleshooting",
    ],
    requirements: [
      "Bachelor's degree in Computer Science, Software Engineering, Information Technology or a related field, or equivalent practical experience",
      "Proficiency in at least one of Java, Python, JavaScript, TypeScript or C#",
      "Understanding of object-oriented programming, data structures and software development principles",
      "Familiarity with relational databases and SQL",
      "Knowledge of REST APIs, Git and modern development workflows",
      "Strong debugging, analytical and teamwork skills",
      "Preferred: React, Angular, Node.js, Spring Boot or .NET",
      "Preferred: AWS or Azure, CI/CD pipelines, Docker, Agile practices, application security and automated testing",
    ],
  },
  {
    title: "Automation Test Engineer",
    department: "Quality Assurance & Testing",
    description:
      "Consult America is seeking an Automation Test Engineer to build and maintain the automated testing that keeps our software reliable. You will work with developers, QA engineers and business teams to improve test coverage, find defects early and make releases something the team trusts rather than dreads.",
    responsibilities: [
      "Design, develop and maintain automated test scripts and testing frameworks",
      "Execute functional, regression, integration and end-to-end testing",
      "Identify, document, track and verify software defects",
      "Work with developers and business analysts to understand application requirements",
      "Integrate automated testing into CI/CD pipelines",
      "Maintain test plans, test cases and testing documentation",
      "Analyse test results and recommend improvements to application quality",
      "Perform API, database and user interface testing",
      "Take part in Agile ceremonies and release validation",
    ],
    requirements: [
      "Bachelor's degree in Computer Science, Information Technology, Engineering or a related field, or equivalent practical experience",
      "Experience with an automation framework such as Selenium, Playwright or Cypress",
      "Scripting in Java, Python or JavaScript",
      "Understanding of software testing methodologies, SDLC and STLC",
      "Familiarity with API testing tools such as Postman or REST Assured",
      "Experience with a defect tracker such as Jira",
      "Strong attention to detail and troubleshooting skills",
      "Preferred: Jenkins or GitHub Actions, JMeter, SQL and database validation, Agile or Scrum environments",
    ],
  },
  {
    title: "Data Engineer",
    department: "Data Engineering & Analytics",
    description:
      "Consult America is seeking a Data Engineer to design, build and maintain the data pipelines and infrastructure behind our analytics, reporting and business intelligence. You will work with engineers, analysts and business stakeholders to keep data accurate, accessible, secure and efficiently processed.",
    responsibilities: [
      "Design, develop and maintain reliable ETL and ELT pipelines",
      "Integrate data from databases, APIs and cloud services",
      "Build and optimise data warehouses, databases and processing workflows",
      "Develop data transformation, validation and quality monitoring",
      "Work with analytics and business teams to support reporting and decision-making",
      "Troubleshoot pipeline failures and optimise processing performance",
      "Implement data governance, security and access control",
      "Document data architecture, pipelines and technical processes",
      "Support cloud data platforms and automation",
    ],
    requirements: [
      "Bachelor's degree in Computer Science, Data Engineering, Information Technology or a related field, or equivalent practical experience",
      "Strong SQL and Python",
      "Understanding of relational databases, data modelling and ETL or ELT processes",
      "Familiarity with data warehouses and cloud data platforms",
      "Experience with structured and semi-structured data",
      "Strong analytical, debugging and problem-solving skills",
      "Preferred: AWS, Azure or Google Cloud",
      "Preferred: Apache Spark, Airflow, Kafka or dbt, and Snowflake, Redshift or BigQuery",
    ],
  },
  {
    title: "Oracle ERP Consultant",
    department: "Enterprise Applications",
    description:
      "Consult America is seeking an Oracle ERP Consultant to implement, configure, integrate and optimise Oracle ERP solutions. You will bring experience with Oracle Fusion Cloud ERP or Oracle E-Business Suite, strong business process knowledge, and the ability to work with both technical and functional teams.",
    responsibilities: [
      "Implement, configure, customise and support Oracle ERP applications against business requirements",
      "Gather and analyse functional and technical requirements from stakeholders",
      "Support Oracle Fusion Cloud ERP modules including Financials, Procurement, SCM and Project Management",
      "Build and maintain integrations between Oracle ERP and third-party applications",
      "Assist with data migration, validation, reconciliation and system testing",
      "Troubleshoot application issues and provide production support",
      "Develop reports and dashboards using Oracle reporting tools",
      "Prepare functional specifications, technical documentation and user training material",
      "Work with business analysts, developers and project managers across the implementation lifecycle",
      "Support upgrades, enhancements and continuous process improvement",
    ],
    requirements: [
      "Bachelor's degree in Computer Science, Information Technology, Information Systems, Business Administration or a related field",
      "Experience with Oracle Fusion Cloud ERP or Oracle E-Business Suite",
      "Understanding of enterprise business processes and ERP implementation methodologies",
      "Knowledge of Oracle ERP modules such as Financials, Procurement or SCM",
      "Familiarity with SQL, data integration and enterprise reporting",
      "Strong analytical, troubleshooting, communication and documentation skills",
      "Able to work onsite in Hagerstown, Maryland",
      "Preferred: Oracle Integration Cloud, Fusion SCM, PIM or PDH",
      "Preferred: BI Publisher, OTBI, Oracle Analytics, REST and SOAP APIs, FBDI, ADFdi, Oracle Cloud certifications",
    ],
  },
  {
    title: "Oracle SCM Cloud Consultant",
    department: "Enterprise Applications",
    description:
      "Consult America is seeking an Oracle SCM Cloud Consultant to implement, configure, integrate and optimise Oracle Fusion Cloud Supply Chain Management. You will bring functional and technical knowledge of Oracle SCM modules including Product Information Management, Product Data Hub, Procurement, Inventory and Order Management.",
    responsibilities: [
      "Implement, configure and support Oracle Fusion Cloud SCM applications",
      "Gather business requirements and translate them into functional and technical specifications",
      "Configure and maintain Product Information Management and Product Data Hub",
      "Support Procurement, Inventory Management, Order Management and related SCM modules",
      "Manage item master data, product catalogues, item attributes, categories and lifecycle processes",
      "Build and support integrations using Oracle Integration Cloud, REST and SOAP services",
      "Perform data migration, validation and bulk uploads using FBDI and ADFdi",
      "Troubleshoot application issues, integration failures and data inconsistencies",
      "Develop operational reports using OTBI and BI Publisher",
      "Take part in system integration testing, user acceptance testing and deployment",
      "Prepare technical documentation, configuration guides and end-user training",
      "Support post-implementation activities, enhancements and process improvement",
    ],
    requirements: [
      "Bachelor's degree in Computer Science, Information Technology, Information Systems, Engineering, Supply Chain Management or a related field",
      "Experience implementing or supporting Oracle Fusion Cloud SCM applications",
      "Working knowledge of PIM or PDH, Procurement, Inventory or Order Management",
      "Understanding of supply chain business processes and enterprise master data management",
      "Familiarity with SQL, REST APIs and Oracle reporting tools",
      "Experience gathering requirements, configuring applications and troubleshooting production issues",
      "Strong communication, analytical and problem-solving skills",
      "Able to work onsite in Hagerstown, Maryland",
      "Preferred: Oracle Integration Cloud, Customer Data Management, Supplier Management, Pricing",
      "Preferred: Fusion Cloud quarterly updates, FBDI, ADFdi, OTBI, BI Publisher, Oracle SCM Cloud certifications",
    ],
  },
] as const;

/**
 * Appended to every posting. The brief carries it on all six, and an EEO
 * statement that appears on some roles and not others is worse than none: it
 * reads as though the omission meant something.
 */
const EEO =
  "Consult America is an equal opportunity employer. Employment decisions are made without regard to race, colour, religion, sex, national origin, disability, age, veteran status, or any other characteristic protected by applicable law.";

const [{ db: name }] = await db.query<{ db: string }>("SELECT current_database() AS db");
console.log(`database: ${name}${name === "neondb" ? "   LIVE CAREERS DATABASE" : ""}\n`);

const existing = await db.query<{ title: string }>("SELECT title FROM jobs");
const have = new Set(existing.map((r) => r.title.toLowerCase()));

let created = 0;
let skipped = 0;
for (const role of ROLES) {
  if (have.has(role.title.toLowerCase())) {
    console.log(`  skip     ${role.title}  (already exists)`);
    skipped += 1;
    continue;
  }
  const job = await createJob(
    {
      title: role.title,
      department: role.department,
      location: "Hagerstown, MD",
      workplaceType: "ONSITE",
      employmentType: "FULL_TIME",
      description: `${role.description}\n\n${EEO}`,
      responsibilities: [...role.responsibilities],
      requirements: [...role.requirements],
      // Salary and experience level omitted on purpose: the brief records both
      // as "Not specified" and asks for them to be confirmed before publishing.
      status: "DRAFT",
    },
    null,
  );
  console.log(`  created  ${job.reference}  ${job.title}`);
  created += 1;
}

console.log(`\n${created} created, ${skipped} skipped. All DRAFT: invisible to candidates until published.`);
