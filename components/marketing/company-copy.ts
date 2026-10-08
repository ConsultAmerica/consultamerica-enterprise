/** Approved company messaging shared by /about and /careers. */

export const CAPABILITIES = [
  {
    title: "Enterprise Transformation",
    body: "Reshape finance, procurement, and supply-chain operations around a connected, modern digital core.",
  },
  {
    title: "Oracle Cloud",
    body: "Migrate and modernize ERP, HCM, and SCM on Oracle Cloud, with a right-sized roadmap and a low-drama cutover.",
  },
  {
    title: "AI + Data",
    body: "Forecasting, assistants, and automation — operationalized with the data foundations and guardrails to run in production.",
  },
  {
    title: "Engineering",
    body: "Senior engineers who ship production systems, cloud-native builds, integrations, and the platforms your business runs on.",
  },
  {
    title: "Managed Services",
    body: "We run and evolve what we build — SLAs, monitoring, and continuous improvement after go-live.",
  },
] as const;

export const PHASES = ["Strategy", "Design", "Build", "Run"] as const;

export const WHY = [
  {
    title: "We engineer, not just advise",
    body: "Production systems, not slideware — senior practitioners stay attached to delivery.",
  },
  {
    title: "AI-first, operationalized",
    body: "Models that run, monitored and governed, connected to the enterprise core.",
  },
  {
    title: "Talent on tap",
    body: "Elite engineers and Oracle specialists — embedded in your teams or hired direct.",
  },
] as const;

export const COMPANY_SUMMARY =
  "Consult America unites engineering, AI, and enterprise consulting — with the specialized technology talent to design it, build it, and run it in production.";

export const CAREERS_SUMMARY =
  "We hire engineers, data scientists, and consultants who want to ship real systems for real enterprises — and keep growing while they do it.";

export const HIRING_STEPS = [
  { title: "Explore opportunities", body: "Browse open roles and find the work that fits your experience." },
  { title: "Apply", body: "A short application with your resume — it carries your professional history." },
  { title: "Recruiting review", body: "Our recruiting team reviews your application against the role." },
  { title: "Interview process", body: "Shortlisted candidates are invited to interviews with the team." },
  { title: "Decision", body: "The team makes a hiring decision for the role." },
] as const;

/** What the Easy Apply form actually asks for (components/jobs/EasyApplyForm.tsx). */
export const EASY_APPLY_FACTS = {
  required: ["First name", "Last name", "Email", "Phone", "Resume"],
  optional: ["Location", "LinkedIn profile"],
  resumeFormats: "PDF, DOC, or DOCX, up to 10 MB",
  note: "Your resume carries your work history, education, and skills — there is no need to re-enter them.",
  detailed:
    "Prefer to share more? Detailed Apply reads your resume, pre-fills your experience, education, skills and certifications for you to review, then submits the same application.",
} as const;
