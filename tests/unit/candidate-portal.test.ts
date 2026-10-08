import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createMemoryCandidatePortalStore } = await import("@/lib/candidate-portal/store-memory");
const { createMemoryResumeProfileStore } = await import("@/lib/recruiting/resume-profiles");
const { candidateStatus } = await import("@/lib/candidate-portal/labels");
const { effectiveProfile, profileFromParsed } = await import("@/lib/candidate-portal/resume-profile");
const { parseResumeByRules } = await import("@/lib/recruiting/resume-parser");
const { CANDIDATE_RETURN_PREFIXES, sanitizeReturnTo } = await import("@/lib/auth/return-to");

const A = "cand-a";
const B = "cand-b";
const file = (name: string) => ({ fileName: name, mimeType: "application/pdf", fileSize: 3, bytes: new Uint8Array([1, 2, 3]) });

function setup() {
  let n = 0;
  let t = Date.parse("2026-10-01T00:00:00Z");
  const resumeProfiles = createMemoryResumeProfileStore();
  const store = createMemoryCandidatePortalStore({ resumeProfiles, newId: (p) => `${p}-${++n}`, now: () => new Date((t += 60_000)) });
  return { store, resumeProfiles };
}

describe("résumé library", () => {
  it("keeps multiple versions, newest first, with one default", async () => {
    const { store } = setup();
    const first = await store.uploadResume(A, file("v1.pdf"), { makeDefault: false });
    const second = await store.uploadResume(A, file("v2.pdf"), { makeDefault: false });
    let list = await store.listResumes(A);
    expect(list.map((r) => r.fileName)).toEqual(["v2.pdf", "v1.pdf"]);
    // The first upload becomes the default automatically; later ones do not.
    expect(list.find((r) => r.isDefault)?.documentId).toBe(first.documentId);

    expect(await store.setDefaultResume(A, second.documentId)).toBe(true);
    list = await store.listResumes(A);
    expect(list.filter((r) => r.isDefault).map((r) => r.documentId)).toEqual([second.documentId]);
  });

  it("removing a résumé submitted with an application keeps it as a previous version", async () => {
    const { store } = setup();
    const { documentId } = await store.uploadResume(A, file("sent.pdf"), { makeDefault: true });
    store.recordApplication(A, {
      applicationId: "app-1",
      applicationNumber: "APP-1",
      status: "APPLIED",
      appliedAt: "2026-10-02T00:00:00Z",
      updatedAt: null,
      job: { title: "Engineer", slug: "engineer", company: "Consult America" },
      resume: { documentId, fileName: "sent.pdf" },
    });

    expect(await store.removeResume(A, documentId)).toEqual({ removed: true, preservedForApplications: true });
    expect(await store.listResumes(A)).toEqual([]);
    const all = await store.listResumes(A, { includeArchived: true });
    expect(all).toMatchObject([{ documentId, status: "ARCHIVED", applicationCount: 1, isDefault: false }]);
    // The exact submitted file is still retrievable for the application history.
    expect(await store.resumeDownload(A, documentId)).toMatchObject({ kind: "bytes", fileName: "sent.pdf" });
    // An archived version can't be made the default for new applications.
    expect(await store.setDefaultResume(A, documentId)).toBe(false);
  });

  it("an unused résumé is deleted outright", async () => {
    const { store } = setup();
    const { documentId } = await store.uploadResume(A, file("draft.pdf"), { makeDefault: false });
    expect(await store.removeResume(A, documentId)).toEqual({ removed: true, preservedForApplications: false });
    expect(await store.listResumes(A, { includeArchived: true })).toEqual([]);
    expect(await store.resumeDownload(A, documentId)).toBeNull();
  });

  it("another candidate cannot see, download, default, remove or correct a résumé", async () => {
    const { store, resumeProfiles } = setup();
    const { documentId } = await store.uploadResume(A, file("mine.pdf"), { makeDefault: true });
    await resumeProfiles.save({
      id: `rp-${documentId}`,
      candidateId: A,
      documentId,
      status: "PARSED",
      parserVersion: "resume-parser/1",
      extractedText: "Skills: TypeScript",
      structured: parseResumeByRules("Skills: TypeScript"),
      error: null,
      parsedAt: "2026-10-01T00:00:00Z",
    });

    expect(await store.listResumes(B)).toEqual([]);
    expect(await store.resumeDownload(B, documentId)).toBeNull();
    expect(await store.setDefaultResume(B, documentId)).toBe(false);
    expect(await store.removeResume(B, documentId)).toEqual({ removed: false, preservedForApplications: false });
    expect(await store.getResumeProfile(B, documentId)).toBeNull();
    expect(await store.saveResumeReview(B, documentId, profileFromParsed(null))).toBe(false);
    expect((await store.listResumes(A))[0]).toMatchObject({ documentId, isDefault: true, status: "ACTIVE" });
  });

  it("corrections are stored beside the parser output, never over it", async () => {
    const { store, resumeProfiles } = setup();
    const { documentId } = await store.uploadResume(A, file("cv.pdf"), { makeDefault: true });
    expect(await store.saveResumeReview(A, documentId, profileFromParsed(null))).toBe(false); // not parsed yet

    const text = "Jane Doe\nSkills: TypeScript, PostgreSQL\nCertifications\nAWS Certified Developer";
    await resumeProfiles.save({
      id: `rp-${documentId}`,
      candidateId: A,
      documentId,
      status: "PARSED",
      parserVersion: "resume-parser/1",
      extractedText: text,
      structured: parseResumeByRules(text),
      error: null,
      parsedAt: "2026-10-01T00:00:00Z",
    });
    const view = await store.getResumeProfile(A, documentId);
    expect(view?.state).toBe("PARSED");
    const corrected = { ...effectiveProfile(view!), skills: ["TypeScript", "PostgreSQL", "Kubernetes"] };
    expect(await store.saveResumeReview(A, documentId, corrected)).toBe(true);

    const after = await store.getResumeProfile(A, documentId);
    expect(after?.reviewed?.skills).toContain("Kubernetes");
    expect(after?.parsed?.skills.map((s) => s.name)).not.toContain("Kubernetes");
    expect(effectiveProfile(after!).skills).toContain("Kubernetes");
  });
});

describe("applications, saved jobs, profile", () => {
  it("application history and saved jobs are per candidate", async () => {
    const { store } = setup();
    store.recordApplication(A, {
      applicationId: "app-1",
      applicationNumber: "APP-1",
      status: "RECRUITER_SCREEN",
      appliedAt: "2026-10-02T00:00:00Z",
      updatedAt: null,
      job: { title: "Engineer", slug: "engineer", company: null },
      resume: null,
    });
    await store.saveJob(A, "req-1");
    await store.saveJob(A, "req-1"); // idempotent

    expect(await store.listApplications(A)).toHaveLength(1);
    expect(await store.listApplications(B)).toEqual([]);
    expect(await store.listSavedJobs(A)).toHaveLength(1);
    expect(await store.isJobSaved(B, "req-1")).toBe(false);
    await store.unsaveJob(B, "req-1"); // no effect on A
    expect(await store.isJobSaved(A, "req-1")).toBe(true);
  });

  it("profile updates never change the sign-in email or another candidate", async () => {
    const { store } = setup();
    const base = {
      firstName: "Ann",
      lastName: "A",
      phone: "",
      city: "",
      state: "",
      linkedinUrl: "",
      portfolioUrl: "",
      githubUrl: "",
      professionalSummary: "",
      workAuthorization: "",
    };
    store.seedProfile({ candidateId: A, email: "ann@example.test", ...base });
    store.seedProfile({ candidateId: B, email: "bo@example.test", ...base, firstName: "Bo" });
    await store.updateProfile(A, { ...base, firstName: "Annie", city: "Austin" });
    expect(await store.getProfile(A)).toMatchObject({ firstName: "Annie", city: "Austin", email: "ann@example.test" });
    expect((await store.getProfile(B))?.firstName).toBe("Bo");
  });

  it("collapses internal pipeline stages into candidate-facing statuses", () => {
    expect(candidateStatus("RECRUITER_SCREEN").label).toBe("Under review");
    expect(candidateStatus("HIRING_MANAGER_REVIEW").label).toBe("Under review");
    expect(candidateStatus("FINAL_INTERVIEW").label).toBe("Interviewing");
    expect(candidateStatus("REJECTED").label).toBe("Not selected");
  });
});

describe("candidate sign-in return paths", () => {
  it("allows portal and job pages, rejects everything else", () => {
    expect(sanitizeReturnTo("/candidate/drafts", CANDIDATE_RETURN_PREFIXES)).toBe("/candidate/drafts");
    expect(sanitizeReturnTo("/jobs/senior-engineer/apply/detailed", CANDIDATE_RETURN_PREFIXES)).toBe("/jobs/senior-engineer/apply/detailed");
    for (const bad of ["/app/recruiting", "https://evil.test", "//evil.test", "/candidate/../app", "/jobsevil"]) {
      expect(sanitizeReturnTo(bad, CANDIDATE_RETURN_PREFIXES)).toBeNull();
    }
    // Staff default is unchanged.
    expect(sanitizeReturnTo("/candidate")).toBeNull();
  });
});
