import { describe, expect, it } from "vitest";

import {
  submitEasyApplication,
  EasyApplyStageError,
  type EasyApplyInput,
  type EasyApplyLogEvent,
  type EasyApplyPorts,
} from "@/lib/recruiting/easy-apply";
import { JobClosedError } from "@/lib/recruiting/errors";

type PortName = keyof EasyApplyPorts;

/** In-memory persistence with per-operation failure injection. */
function createFakeStore(options: { jobOpen?: boolean; jobLookupFails?: boolean } = {}) {
  const state = {
    candidates: new Map<string, string>(), // email -> candidateId
    applications: new Map<string, { id: string; applicationNumber: string }>(), // cand|req -> app
    objects: new Set<string>(),
    documents: new Map<string, { candidateId: string; primary: boolean; library?: boolean }>(),
    links: new Map<string, string>(), // applicationId -> documentId
    submissions: [] as string[],
    portalInvites: 0,
    activated: new Set<string>(), // candidate ids with an ACTIVE portal account
  };
  const failures = new Map<PortName, number>();
  const failNext = (port: PortName, times = 1) => failures.set(port, times);
  const maybeFail = (port: PortName) => {
    const left = failures.get(port) ?? 0;
    if (left > 0) {
      failures.set(port, left - 1);
      throw new Error(`injected ${port} failure`);
    }
  };

  const ports: EasyApplyPorts = {
    async isJobOpen() {
      if (options.jobLookupFails) throw new Error("injected job lookup failure (42703)");
      return options.jobOpen ?? true;
    },
    async findCandidateIdByEmail(email) {
      maybeFail("findCandidateIdByEmail");
      return state.candidates.get(email) ?? null;
    },
    async hasActivatedAccount(candidateId) {
      return state.activated.has(candidateId);
    },
    async findLibraryResume({ candidateId, documentId }) {
      maybeFail("findLibraryResume");
      const doc = state.documents.get(documentId);
      return Boolean(doc?.library && doc.candidateId === candidateId);
    },
    async createCandidate({ id, data }) {
      maybeFail("createCandidate");
      state.candidates.set(data.email.trim().toLowerCase(), id);
    },
    async ensurePortalAccount() {
      maybeFail("ensurePortalAccount");
      state.portalInvites += 1;
    },
    async findApplication(candidateId, requisitionId) {
      return state.applications.get(`${candidateId}|${requisitionId}`) ?? null;
    },
    async findResumeLink(applicationId) {
      maybeFail("findResumeLink");
      return state.links.get(applicationId) ?? null;
    },
    async uploadResumeObject({ candidateId, documentId, resume }) {
      maybeFail("uploadResumeObject");
      const path = `${candidateId}/${documentId}/${resume.fileName}`;
      state.objects.add(path);
      return path;
    },
    async removeResumeObject(path) {
      maybeFail("removeResumeObject");
      state.objects.delete(path);
    },
    async insertResumeDocument({ documentId, candidateId }) {
      maybeFail("insertResumeDocument");
      state.documents.set(documentId, { candidateId, primary: false });
    },
    async removeResumeDocument(documentId) {
      maybeFail("removeResumeDocument");
      state.documents.delete(documentId);
    },
    async createApplication({ id, applicationNumber, candidateId, data }) {
      maybeFail("createApplication");
      const key = `${candidateId}|${data.requisitionId}`;
      if (state.applications.has(key)) throw new Error("duplicate key (23505)");
      state.applications.set(key, { id, applicationNumber });
    },
    async deleteApplication(applicationId) {
      maybeFail("deleteApplication");
      for (const [key, app] of state.applications) {
        if (app.id === applicationId) state.applications.delete(key);
      }
    },
    async linkResume({ applicationId, documentId }) {
      maybeFail("linkResume");
      if (state.links.has(applicationId)) throw new Error("one resume per application (23505)");
      state.links.set(applicationId, documentId);
    },
    async markPrimaryResume({ candidateId, documentId }) {
      maybeFail("markPrimaryResume");
      for (const [id, doc] of state.documents) {
        if (doc.candidateId === candidateId) doc.primary = id === documentId;
      }
    },
    async recordSubmission({ applicationId }) {
      maybeFail("recordSubmission");
      state.submissions.push(applicationId);
    },
  };

  let counter = 0;
  const logs: EasyApplyLogEvent[] = [];
  const deps = {
    ports,
    log: (event: EasyApplyLogEvent) => logs.push(event),
    newId: (prefix: string) => `${prefix}-${++counter}`,
    now: () => "2026-10-07T12:00:00.000Z",
  };
  return { state, failNext, deps, logs };
}

const input: EasyApplyInput = {
  requisitionId: "req-1",
  postingId: "post-1",
  firstName: "Test",
  lastName: "Candidate",
  email: "Test.Candidate@example.com",
  phone: "555-0100",
  source: "Careers Site",
  resume: { fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 4, bytes: new Uint8Array([1, 2, 3, 4]) },
};

/** Every application that exists has exactly one linked, stored resume. */
function expectNoIncompleteApplications(state: ReturnType<typeof createFakeStore>["state"]) {
  for (const app of state.applications.values()) {
    const docId = state.links.get(app.id);
    expect(docId, `application ${app.id} has no resume link`).toBeDefined();
    expect(state.documents.has(docId!)).toBe(true);
  }
}

describe("Easy Apply workflow", () => {
  it("1. succeeds only with candidate, application, stored resume, metadata and link", async () => {
    const { state, deps } = createFakeStore();
    const result = await submitEasyApplication(input, deps);

    expect(result.outcome).toBe("created");
    expect(state.candidates.get("test.candidate@example.com")).toBe(result.candidateId);
    expect(state.applications.size).toBe(1);
    expect(state.objects.size).toBe(1);
    const docId = state.links.get(result.applicationId)!;
    expect(state.documents.get(docId)).toEqual({ candidateId: result.candidateId, primary: true });
    expect(state.submissions).toEqual([result.applicationId]);
  });

  it("2. resume upload failure: no success, no application left behind", async () => {
    const { state, failNext, deps, logs } = createFakeStore();
    failNext("uploadResumeObject");

    await expect(submitEasyApplication(input, deps)).rejects.toMatchObject({ stage: "resume-upload" });
    expect(state.applications.size).toBe(0);
    expect(state.documents.size).toBe(0);
    expect(state.objects.size).toBe(0);
    expect(logs.some((l) => l.stage === "resume-upload" && l.level === "error")).toBe(true);
  });

  it("3. document metadata failure: no success, uploaded object cleaned up", async () => {
    const { state, failNext, deps } = createFakeStore();
    failNext("insertResumeDocument");

    await expect(submitEasyApplication(input, deps)).rejects.toMatchObject({ stage: "document-metadata" });
    expect(state.applications.size).toBe(0);
    expect(state.objects.size).toBe(0);
  });

  it("4. application/document link failure: no success, application compensated, artifacts cleaned up", async () => {
    const { state, failNext, deps } = createFakeStore();
    failNext("linkResume");

    await expect(submitEasyApplication(input, deps)).rejects.toMatchObject({ stage: "document-link" });
    expect(state.applications.size).toBe(0);
    expect(state.documents.size).toBe(0);
    expect(state.objects.size).toBe(0);
    expect(state.submissions).toEqual([]);
  });

  it("5. retry after a partial failure completes the same application without duplicating it", async () => {
    const { state, failNext, deps, logs } = createFakeStore();
    // Link fails AND the compensating delete fails: an application without a resume remains.
    failNext("linkResume");
    failNext("deleteApplication");

    await expect(submitEasyApplication(input, deps)).rejects.toBeInstanceOf(EasyApplyStageError);
    expect(state.applications.size).toBe(1);
    const [partial] = [...state.applications.values()];
    expect(state.links.has(partial.id)).toBe(false);
    expect(logs.some((l) => l.stage === "cleanup")).toBe(true);

    const retry = await submitEasyApplication(input, deps);
    expect(retry.outcome).toBe("recovered");
    expect(retry.applicationId).toBe(partial.id);
    expect(retry.applicationNumber).toBe(partial.applicationNumber);
    expect(state.applications.size).toBe(1);
    expectNoIncompleteApplications(state);
  });

  it("5b. retry after a clean failure creates the application once", async () => {
    const { state, failNext, deps } = createFakeStore();
    failNext("uploadResumeObject");
    await expect(submitEasyApplication(input, deps)).rejects.toBeInstanceOf(EasyApplyStageError);

    const retry = await submitEasyApplication(input, deps);
    expect(retry.outcome).toBe("created");
    expect(state.candidates.size).toBe(1);
    expect(state.applications.size).toBe(1);
    expectNoIncompleteApplications(state);
  });

  it("6. duplicate submission after success returns the existing application and stores nothing new", async () => {
    const { state, deps } = createFakeStore();
    const first = await submitEasyApplication(input, deps);
    const objectsBefore = state.objects.size;

    const second = await submitEasyApplication({ ...input, email: "test.candidate@EXAMPLE.com" }, deps);
    expect(second.outcome).toBe("existing");
    expect(second.applicationId).toBe(first.applicationId);
    expect(second.applicationNumber).toBe(first.applicationNumber);
    expect(state.applications.size).toBe(1);
    expect(state.objects.size).toBe(objectsBefore);
    expect(state.submissions).toHaveLength(1);
  });

  it("7. genuinely closed job is rejected with JobClosedError before any writes", async () => {
    const { state, deps } = createFakeStore({ jobOpen: false });
    await expect(submitEasyApplication(input, deps)).rejects.toBeInstanceOf(JobClosedError);
    expect(state.candidates.size).toBe(0);
    expect(state.objects.size).toBe(0);
  });

  it("8. job lookup failure is a stage error, not a closed job", async () => {
    const { state, deps, logs } = createFakeStore({ jobLookupFails: true });
    const attempt = submitEasyApplication(input, deps);
    await expect(attempt).rejects.toMatchObject({ stage: "job-lookup" });
    await expect(attempt).rejects.not.toBeInstanceOf(JobClosedError);
    expect(state.candidates.size).toBe(0);
    expect(logs[0]).toMatchObject({ stage: "job-lookup", level: "error" });
  });

  it("portal invite and enrichment failures do not block success", async () => {
    const { state, failNext, deps, logs } = createFakeStore();
    failNext("ensurePortalAccount");
    failNext("markPrimaryResume");
    failNext("recordSubmission");

    const result = await submitEasyApplication(input, deps);
    expect(result.outcome).toBe("created");
    expectNoIncompleteApplications(state);
    expect(logs.filter((l) => l.level === "warn").map((l) => l.stage)).toEqual([
      "portal-account",
      "primary-resume",
      "submission-record",
    ]);
  });

  it("anonymous submission onto an ACTIVATED account: filed, but no invitation and the owner's default résumé is kept", async () => {
    const { state, deps } = createFakeStore();
    const first = await submitEasyApplication(input, deps);
    const ownersDefault = [...state.documents].find(([, d]) => d.primary)![0];
    state.activated.add(first.candidateId);
    const invitesBefore = state.portalInvites;

    const second = await submitEasyApplication({ ...input, requisitionId: "req-2" }, deps);
    expect(second.outcome).toBe("created");
    expect(second.candidateId).toBe(first.candidateId);
    expectNoIncompleteApplications(state);
    expect(state.portalInvites).toBe(invitesBefore);
    expect(state.documents.get(ownersDefault)!.primary).toBe(true);
    expect(state.documents.get(second.resumeDocumentId)!.primary).toBe(false);
  });

  it("allowPortalInvite=false (rate-limited client) still files the application but sends no invitation", async () => {
    const { state, deps } = createFakeStore();
    const result = await submitEasyApplication({ ...input, allowPortalInvite: false }, deps);
    expect(result.outcome).toBe("created");
    expectNoIncompleteApplications(state);
    expect(state.portalInvites).toBe(0);
  });

  it("logs ids only — never the email or resume bytes", async () => {
    const { failNext, deps, logs } = createFakeStore();
    failNext("linkResume");
    await expect(submitEasyApplication(input, deps)).rejects.toBeInstanceOf(EasyApplyStageError);
    const serialized = JSON.stringify(logs, (_k, v) => (v instanceof Error ? v.message : v));
    expect(serialized).not.toContain("example.com");
    expect(serialized).not.toContain("[1,2,3,4]");
  });

  describe("signed-in candidate (session candidate + library résumé)", () => {
    function withLibrary() {
      const store = createFakeStore();
      store.state.documents.set("doc-lib", { candidateId: "cand-me", primary: false, library: true });
      store.state.documents.set("doc-default", { candidateId: "cand-me", primary: true, library: true });
      store.state.documents.set("doc-other", { candidateId: "cand-other", primary: false, library: true });
      return store;
    }
    const signedIn: EasyApplyInput = {
      ...input,
      resume: undefined,
      sessionCandidateId: "cand-me",
      libraryResumeDocumentId: "doc-lib",
    };

    it("files on the session candidate without an email lookup or a new upload", async () => {
      const { state, failNext, deps } = withLibrary();
      failNext("findCandidateIdByEmail", 5); // would throw if consulted
      const result = await submitEasyApplication(signedIn, deps);

      expect(result).toMatchObject({ candidateId: "cand-me", outcome: "created", resumeDocumentId: "doc-lib" });
      expect(state.candidates.size).toBe(0);
      expect(state.objects.size).toBe(0);
      expect(state.links.get(result.applicationId)).toBe("doc-lib");
      // The candidate's chosen default résumé is left alone.
      expect(state.documents.get("doc-default")?.primary).toBe(true);
      expect(state.documents.get("doc-lib")?.primary).toBe(false);
    });

    it("rejects another candidate's document before creating an application", async () => {
      const { state, deps } = withLibrary();
      await expect(
        submitEasyApplication({ ...signedIn, libraryResumeDocumentId: "doc-other" }, deps),
      ).rejects.toMatchObject({ stage: "document-metadata" });
      expect(state.applications.size).toBe(0);
    });

    it("ignores a library document id without a session candidate", async () => {
      const { state, deps } = withLibrary();
      const result = await submitEasyApplication({ ...input, libraryResumeDocumentId: "doc-other" }, deps);
      expect(state.links.get(result.applicationId)).not.toBe("doc-other");
      expect(state.objects.size).toBe(1);
    });

    it("link failure compensates the application but never removes the library résumé", async () => {
      const { state, failNext, deps } = withLibrary();
      failNext("linkResume");
      await expect(submitEasyApplication(signedIn, deps)).rejects.toMatchObject({ stage: "document-link" });
      expect(state.applications.size).toBe(0);
      expect(state.documents.has("doc-lib")).toBe(true);
    });

    it("a repeat submission returns the existing application", async () => {
      const { state, deps } = withLibrary();
      const first = await submitEasyApplication(signedIn, deps);
      const second = await submitEasyApplication(signedIn, deps);
      expect(second).toMatchObject({ outcome: "existing", applicationId: first.applicationId });
      expect(state.applications.size).toBe(1);
    });

    it("fails cleanly when neither an upload nor a library résumé is given", async () => {
      const { state, deps } = withLibrary();
      await expect(
        submitEasyApplication({ ...signedIn, libraryResumeDocumentId: undefined }, deps),
      ).rejects.toMatchObject({ stage: "resume-upload" });
      expect(state.applications.size).toBe(0);
    });
  });
});
