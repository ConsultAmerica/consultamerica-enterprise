/**
 * Synthetic resume text for local demo mode only (no Supabase). Invented
 * person and employers; matches the demo candidate in data/recruiting/seed.ts.
 */
export const seedResumeTexts: { candidateId: string; documentId: string; fileName: string; text: string }[] = [
  {
    candidateId: "cand-demo-001",
    documentId: "doc-demo-001",
    fileName: "Priya_Shah_Resume.pdf",
    text: `Priya Shah
Austin, TX
priya.shah@example.demo | 555-0142 | linkedin.com/in/priya-shah-demo

Summary
Oracle Fusion Financials consultant with 7+ years of experience delivering General Ledger, Accounts Payable and Accounts Receivable implementations for enterprise clients.

Experience
Senior Oracle Financials Consultant, Northwind Advisory
Mar 2021 – Present
Led Oracle Fusion GL, AP and AR configuration; ran UAT cycles; built FBDI data migration loads and OTBI reports.

Oracle Financials Analyst | Contoso Systems
Jun 2018 – Feb 2021
Supported Oracle EBS R12 financials, requirements gathering and SQL reporting.

Education
Bachelor of Science in Accounting
University of Texas at Austin, 2018

Certifications
Oracle Financials Cloud: General Ledger 2023 Certified Implementation Specialist`,
  },
];
