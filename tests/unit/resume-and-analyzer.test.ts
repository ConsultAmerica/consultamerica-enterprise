import { describe, expect, it } from "vitest";

import { seedResumeTexts } from "@/data/recruiting/seed-resumes";
import { extractDocumentText } from "@/lib/documents/text-extraction";
import { analyzeCandidateForJob, rankCandidates, requirementsFromJob } from "@/lib/recruiting/job-analyzer";
import { mergeAIParse, parseResumeByRules, parseResumeText, totalYears } from "@/lib/recruiting/resume-parser";
import { findSkills } from "@/lib/recruiting/skill-taxonomy";

const resume = seedResumeTexts[0].text;

describe("resume parser", () => {
  it("extracts contact, skills, dated experience, education and certifications with evidence", () => {
    const p = parseResumeByRules(resume);
    expect(p.contact).toMatchObject({ name: "Priya Shah", email: "priya.shah@example.demo", location: "Austin, TX" });
    expect(p.skills.map((s) => s.name)).toEqual(expect.arrayContaining(["Oracle Fusion", "General Ledger", "Accounts Payable", "Accounts Receivable", "UAT", "FBDI"]));
    for (const s of p.skills) expect(resume.replace(/\s+/g, " ")).toContain(s.evidence.slice(0, 10));
    expect(p.experience[0]).toMatchObject({ title: "Senior Oracle Financials Consultant", company: "Northwind Advisory", startDate: "2021-03", isCurrent: true });
    expect(p.experience[1]).toMatchObject({ startDate: "2018-06", endDate: "2021-02" });
    expect(p.education[0].degree).toMatch(/bachelor/i);
    expect(p.certifications[0].name).toMatch(/Certified/);
    expect(p.titles).toContain("Senior Oracle Financials Consultant");
  });

  it("does not fabricate: missing sections stay empty", () => {
    const p = parseResumeByRules("Jordan Lee\nSkilled with Python.");
    expect(p.experience).toEqual([]);
    expect(p.education).toEqual([]);
    expect(p.totalYearsExperience).toBeNull();
    expect(p.contact.email).toBeNull();
    expect(p.warnings.join(" ")).toMatch(/No dated work history/);
  });

  it("drops AI-suggested items whose evidence is not in the resume", () => {
    const rules = parseResumeByRules(resume);
    const merged = mergeAIParse(rules, {
      skills: [{ name: "Kubernetes", evidence: "Managed Kubernetes clusters" }, { name: "OTBI", evidence: "OTBI reports" }],
      experience: [{ title: "CFO", company: "Big Bank", startDate: "2010", endDate: null, isCurrent: true, evidence: "Chief Financial Officer at Big Bank" }],
      certifications: [],
    }, resume);
    expect(merged.skills.map((s) => s.name)).not.toContain("Kubernetes");
    expect(merged.experience.some((e) => e.company === "Big Bank")).toBe(false);
    expect(merged.warnings.join(" ")).toMatch(/discarded/);
  });

  it("falls back to rules when the AI parser fails", async () => {
    const { parsed, parserVersion } = await parseResumeText(resume, { model: "x", parse: async () => { throw new Error("down"); } });
    expect(parserVersion).toBe("resume-parser/1+rules");
    expect(parsed.skills.length).toBeGreaterThan(0);
  });

  it("parse failure: unreadable or mislabelled files are rejected safely", async () => {
    expect((await extractDocumentText({ fileName: "resume.pdf", bytes: new TextEncoder().encode("not a pdf") })).ok).toBe(false);
    const docxWithMacro = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode("word/vbaProject.bin")]);
    expect(await extractDocumentText({ fileName: "resume.docx", bytes: docxWithMacro })).toEqual({ ok: false, reason: "macro_enabled" });
    expect(await extractDocumentText({ fileName: "resume.docm", bytes: new Uint8Array([1]) })).toEqual({ ok: false, reason: "macro_enabled" });
    expect(await extractDocumentText({ fileName: "resume.exe", bytes: new Uint8Array([1]) })).toEqual({ ok: false, reason: "unsupported_type" });
    expect(await extractDocumentText({ fileName: "resume.txt", bytes: new Uint8Array(11 * 1024 * 1024) })).toEqual({ ok: false, reason: "too_large" });
  });

  it("computes years from non-overlapping dated roles", () => {
    expect(totalYears([
      { title: "a", company: null, startDate: "2020-01", endDate: "2020-12", isCurrent: false, evidence: "" },
      { title: "b", company: null, startDate: "2020-06", endDate: "2021-12", isCurrent: false, evidence: "" },
    ])).toBe(2);
  });

  it("skill matching respects word boundaries and acronym case", () => {
    expect(findSkills("I enjoy the rest of the team").map((s) => s.name)).not.toContain("REST");
    expect(findSkills("Built REST APIs").map((s) => s.name)).toContain("REST");
    expect(findSkills("JavaScript developer").map((s) => s.name)).not.toContain("Java");
  });
});

const oicJob = requirementsFromJob({
  title: "Oracle Integration Developer",
  description: "Hybrid role in Baltimore building OIC integrations with REST and SOAP.",
  qualifications: ["5+ years of integration experience", "Oracle Fusion experience", "Bachelor's degree"],
  preferredQualifications: ["PPM exposure"],
});

describe("Job Analyzer", () => {
  it("derives required and preferred requirements from the job text", () => {
    expect(oicJob.requiredSkills).toEqual(expect.arrayContaining(["OIC", "REST", "SOAP", "Oracle Fusion"]));
    expect(oicJob.preferredSkills).toEqual(["PPM"]);
    expect(oicJob.minimumYears).toBe(5);
  });

  it("explains matches with evidence and says 'not found in resume' rather than 'lacks'", () => {
    const parsed = parseResumeByRules(resume);
    const a = analyzeCandidateForJob({ parsed, resumeText: resume }, oicJob);
    expect(a.matched).toContain("Oracle Fusion");
    expect(a.notFound).toEqual(expect.arrayContaining(["OIC", "SOAP", "PPM"]));
    expect(a.findings.find((f) => f.requirement === "Oracle Fusion")?.evidence).toBeTruthy();
    expect(a.experience.status).toBe("ALIGNED");
    expect(a.score).toBeGreaterThan(0);
    expect(a.explanation.join(" ")).toMatch(/Not found in resume/);
  });

  it("without a parsed resume everything is UNKNOWN and no score is given", () => {
    const a = analyzeCandidateForJob({ parsed: null, resumeText: null }, oicJob);
    expect(a.score).toBeNull();
    expect(a.band).toBe("INSUFFICIENT_DATA");
    expect(a.unknown).toEqual(expect.arrayContaining(["OIC", "REST"]));
    expect(a.notFound).toEqual([]);
  });

  it("ignores personal details: changing name, contact and location does not change the result", () => {
    const parsed = parseResumeByRules(resume);
    const other = { ...parsed, contact: { name: "Someone Else", email: "x@y.example", phone: null, location: "Elsewhere, CA", linkedin: null } };
    const swapped = resume.replace("Priya Shah", "Someone Else").replace("Austin, TX", "Elsewhere, CA");
    expect(analyzeCandidateForJob({ parsed: other, resumeText: swapped }, oicJob).score).toBe(analyzeCandidateForJob({ parsed, resumeText: resume }, oicJob).score);
  });

  it("job → candidates ranking is read-only and orders by score", () => {
    const strong = parseResumeByRules("Integration Developer\nJan 2015 - Present\nOIC, REST, SOAP, Oracle Fusion, PPM");
    const weak = parseResumeByRules("Designer\nJan 2020 - Present\nFigma");
    const candidates = Object.freeze([
      Object.freeze({ candidate: "weak", evidence: { parsed: weak, resumeText: "Designer Figma" } }),
      Object.freeze({ candidate: "strong", evidence: { parsed: strong, resumeText: "OIC, REST, SOAP, Oracle Fusion, PPM" } }),
    ]);
    const ranked = rankCandidates(oicJob, [...candidates]);
    expect(ranked.map((r) => r.candidate)).toEqual(["strong", "weak"]);
    expect(ranked[0].analysis.score!).toBeGreaterThan(ranked[1].analysis.score!);
  });
});
