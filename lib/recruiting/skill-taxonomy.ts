/**
 * Canonical skill/technology vocabulary shared by the resume parser, email
 * intake and the Job Analyzer. Matching is word-boundary based on the aliases,
 * so "AP" only matches as a standalone token and "Java" never matches
 * "JavaScript". Extend this list as recruiting needs grow.
 */

export type SkillCategory = "oracle" | "integration" | "data" | "cloud" | "language" | "engineering" | "process" | "testing" | "security";

/** `aliases` match case-insensitively; `exact` (short acronyms like "AP", "REST") only as written. */
export type SkillDefinition = { name: string; category: SkillCategory; aliases: string[]; exact?: string[] };

export const SKILLS: SkillDefinition[] = [
  // Oracle ERP / Fusion
  { name: "Oracle Fusion", category: "oracle", aliases: ["oracle fusion", "fusion cloud", "oracle cloud erp", "oracle erp cloud", "fusion applications"] },
  { name: "Oracle EBS", category: "oracle", aliases: ["oracle ebs", "e-business suite", "oracle e-business suite", "ebs r12"] },
  { name: "Oracle Financials", category: "oracle", aliases: ["oracle financials", "fusion financials", "financials cloud"] },
  { name: "General Ledger", category: "oracle", aliases: ["general ledger"], exact: ["GL"] },
  { name: "Accounts Payable", category: "oracle", aliases: ["accounts payable"], exact: ["AP"] },
  { name: "Accounts Receivable", category: "oracle", aliases: ["accounts receivable"], exact: ["AR"] },
  { name: "Fixed Assets", category: "oracle", aliases: ["fixed assets"] },
  { name: "Cash Management", category: "oracle", aliases: ["cash management"] },
  { name: "PPM", category: "oracle", aliases: ["ppm", "project portfolio management", "oracle projects"] },
  { name: "Oracle SCM", category: "oracle", aliases: ["oracle scm", "supply chain management", "scm cloud"] },
  { name: "Oracle HCM", category: "oracle", aliases: ["oracle hcm", "hcm cloud"] },
  { name: "OTBI", category: "oracle", aliases: ["otbi"] },
  { name: "BI Publisher", category: "oracle", aliases: ["bi publisher", "bip"] },
  { name: "FBDI", category: "oracle", aliases: ["fbdi"] },
  // Integration
  { name: "OIC", category: "integration", aliases: ["oic", "oracle integration cloud", "oracle integration"] },
  { name: "REST", category: "integration", aliases: ["restful", "rest api", "rest apis", "rest services", "rest web services"], exact: ["REST"] },
  { name: "SOAP", category: "integration", aliases: ["soap"] },
  { name: "MuleSoft", category: "integration", aliases: ["mulesoft"] },
  { name: "Kafka", category: "integration", aliases: ["kafka"] },
  // Data / AI
  { name: "SQL", category: "data", aliases: ["sql"] },
  { name: "PL/SQL", category: "data", aliases: ["pl/sql", "plsql"] },
  { name: "Spark", category: "data", aliases: ["spark", "pyspark", "apache spark"] },
  { name: "Airflow", category: "data", aliases: ["airflow", "apache airflow"] },
  { name: "Databricks", category: "data", aliases: ["databricks"] },
  { name: "Snowflake", category: "data", aliases: ["snowflake"] },
  { name: "ETL", category: "data", aliases: ["etl", "elt"] },
  { name: "Tableau", category: "data", aliases: ["tableau"] },
  { name: "Power BI", category: "data", aliases: ["power bi", "powerbi"] },
  { name: "Machine Learning", category: "data", aliases: ["machine learning", "ml models"] },
  { name: "LLM", category: "data", aliases: ["llm", "llms", "large language models", "generative ai", "genai"] },
  { name: "RAG", category: "data", aliases: ["retrieval augmented generation", "retrieval-augmented generation"], exact: ["RAG"] },
  // Cloud / platform
  { name: "AWS", category: "cloud", aliases: ["aws", "amazon web services"] },
  { name: "Azure", category: "cloud", aliases: ["azure", "microsoft azure"] },
  { name: "GCP", category: "cloud", aliases: ["gcp", "google cloud"] },
  { name: "OCI", category: "cloud", aliases: ["oci", "oracle cloud infrastructure"] },
  { name: "Kubernetes", category: "cloud", aliases: ["kubernetes", "k8s"] },
  { name: "Docker", category: "cloud", aliases: ["docker"] },
  { name: "Terraform", category: "cloud", aliases: ["terraform"] },
  { name: "CI/CD", category: "cloud", aliases: ["ci/cd", "cicd", "continuous integration"] },
  // Languages / engineering
  { name: "Python", category: "language", aliases: ["python"] },
  { name: "Java", category: "language", aliases: ["java"] },
  { name: "JavaScript", category: "language", aliases: ["javascript"] },
  { name: "TypeScript", category: "language", aliases: ["typescript"] },
  { name: "C#", category: "language", aliases: ["c#", ".net", "dotnet"] },
  { name: "React", category: "engineering", aliases: ["react", "react.js", "reactjs"] },
  { name: "Node.js", category: "engineering", aliases: ["node.js", "nodejs"] },
  { name: "Next.js", category: "engineering", aliases: ["next.js", "nextjs"] },
  // Process / testing / security
  { name: "UAT", category: "testing", aliases: ["uat", "user acceptance testing"] },
  { name: "Test Automation", category: "testing", aliases: ["test automation", "automated testing", "selenium", "playwright"] },
  { name: "QA", category: "testing", aliases: ["quality assurance"], exact: ["QA"] },
  { name: "Agile", category: "process", aliases: ["agile", "scrum"] },
  { name: "Requirements Gathering", category: "process", aliases: ["requirements gathering", "business requirements"] },
  { name: "Data Migration", category: "process", aliases: ["data migration", "data conversion"] },
  { name: "Security Clearance", category: "security", aliases: ["security clearance", "public trust"] },
];

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-ish boundaries that also work for tokens like "c#", ".net", "pl/sql".
const bounded = (alts: string[], flags: string) =>
  new RegExp(`(?<![A-Za-z0-9])(?:${alts.map(escape).join("|")})(?![A-Za-z0-9])`, flags);

const PATTERNS = SKILLS.map((skill) => ({
  skill,
  regexes: [bounded(skill.aliases, "i"), ...(skill.exact?.length ? [bounded(skill.exact, "")] : [])],
}));

export type SkillHit = { name: string; category: SkillCategory; evidence: string };

/** Canonical skills mentioned in `text`, each with the matching text snippet. */
export function findSkills(text: string): SkillHit[] {
  const hits: SkillHit[] = [];
  for (const { skill, regexes } of PATTERNS) {
    const match = regexes.map((r) => r.exec(text)).find(Boolean);
    if (match) {
      const start = Math.max(0, match.index - 40);
      const end = Math.min(text.length, match.index + match[0].length + 40);
      hits.push({ name: skill.name, category: skill.category, evidence: text.slice(start, end).replace(/\s+/g, " ").trim() });
    }
  }
  return hits;
}

const BY_ALIAS = new Map<string, string>();
for (const skill of SKILLS) {
  BY_ALIAS.set(skill.name.toLowerCase(), skill.name);
  for (const alias of [...skill.aliases, ...(skill.exact ?? [])]) BY_ALIAS.set(alias.toLowerCase(), skill.name);
}

/** Maps a free-text skill (e.g. "Oracle Integration Cloud") to its canonical name, or returns it trimmed. */
export function canonicalSkill(raw: string): string {
  const key = raw.trim().toLowerCase();
  return BY_ALIAS.get(key) ?? findSkills(raw)[0]?.name ?? raw.trim();
}
