import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createMemoryCandidatePortalStore } = await import("@/lib/candidate-portal/store-memory");
const { saveApplicationDraft, submitApplicationDraft, deleteApplicationDraft, DRAFT_MESSAGES } = await import(
  "@/lib/candidate-portal/draft-service"
);
const { decideDraftSubmission, isLeaseExpired, parseDraftPayload, SUBMITTING_LEASE_MS } = await import("@/lib/candidate-portal/drafts");
const { JOB_CLOSED_MESSAGE } = await import("@/lib/recruiting/errors");

import type { DraftJob } from "@/lib/candidate-portal/draft-service";
import type { CandidateSession } from "@/lib/candidate-portal/types";

const alice: CandidateSession = { candidateId: "cand-alice", profileId: "p-a", email: "a@example.test", displayName: "Alice A", demo: false };
const bob: CandidateSession = { candidateId: "cand-bob", profileId: "p-b", email: "b@example.test", displayName: "Bob B", demo: false };

const openJob: DraftJob = {
  jobId: "job-1",
  requisitionId: "req-1",
  slug: "senior-engineer",
  title: "Senior Engineer",
  company: "Consult America",
  acceptingApplications: true,
  applicationType: "INTERNAL",
};

type FileFn = Parameters<typeof submitApplicationDraft>[2]["file"];

const pdf = (name = "resume.pdf") => ({ fileName: name, mimeType: "application/pdf", fileSize: 4, bytes: new Uint8Array([1, 2, 3, 4]) });

const payload = {
  contact: { firstName: "Alice", lastName: "Applicant", phone: "555-0100", location: "Austin, TX", linkedinUrl: "", portfolioUrl: "" },
  profile: {
    summary: "Platform engineer",
    skills: ["TypeScript", "PostgreSQL"],
    experience: [{ title: "Engineer", company: "Acme", startDate: "2020-01", endDate: "", isCurrent: true }],
    education: [{ institution: "State University", degree: "BS", fieldOfStudy: "CS", endDate: "2019" }],
    certifications: ["AWS Certified Developer"],
    portfolioUrl: "",
  },
  answers: [{ question: "Notice period?", answer: "Two weeks" }],
  step: 2,
};

function setup() {
  let n = 0;
  let clock = new Date("2026-10-07T12:00:00.000Z");
  const store = createMemoryCandidatePortalStore({ newId: (p) => `${p}-${++n}`, now: () => clock });
  return {
    store,
    advance: (ms: number) => (clock = new Date(clock.getTime() + ms)),
    now: () => clock,
  };
}

describe("Detailed Apply drafts — save and restore", () => {
  it("saves a draft with an uploaded résumé into the private library and restores every section", async () => {
    const { store } = setup();
    const saved = await saveApplicationDraft({ store, session: alice }, { job: openJob, payload, resume: { kind: "upload", file: pdf() } });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.uploadedDocumentId).toBeTruthy();

    const restored = await store.findOpenDraft(alice.candidateId, "req-1");
    expect(restored?.payload).toEqual(parseDraftPayload(payload));
    expect(restored?.payload.profile.experience[0].title).toBe("Engineer");
    expect(restored?.payload.profile.certifications).toEqual(["AWS Certified Developer"]);
    expect(restored?.payload.answers).toEqual([{ question: "Notice period?", answer: "Two weeks" }]);
    expect(restored?.resumeDocumentId).toBe(saved.uploadedDocumentId);

    // The upload is a library résumé, not the default (the candidate decides that).
    const library = await store.listResumes(alice.candidateId);
    expect(library).toHaveLength(1);
    expect(library[0]).toMatchObject({ documentId: saved.uploadedDocumentId, status: "ACTIVE" });
  });

  it("a later save edits the same draft and bumps the revision; a stale revision is a conflict", async () => {
    const { store } = setup();
    const first = await saveApplicationDraft({ store, session: alice }, { job: openJob, payload, resume: { kind: "none" } });
    if (!first.ok) throw new Error(first.error);
    const second = await saveApplicationDraft(
      { store, session: alice },
      { job: openJob, draftId: first.draft.id, expectedRevision: first.draft.revision, payload: { ...payload, step: 3 }, resume: { kind: "keep" } },
    );
    expect(second).toMatchObject({ ok: true, draft: { id: first.draft.id, revision: 2 } });

    const stale = await saveApplicationDraft(
      { store, session: alice },
      { job: openJob, draftId: first.draft.id, expectedRevision: 1, payload, resume: { kind: "keep" } },
    );
    expect(stale).toEqual({ ok: false, error: DRAFT_MESSAGES.conflict, conflict: true });
  });

  it("never forks a second open draft for the same job (e.g. another tab)", async () => {
    const { store } = setup();
    await saveApplicationDraft({ store, session: alice }, { job: openJob, payload, resume: { kind: "none" } });
    const again = await saveApplicationDraft({ store, session: alice }, { job: openJob, payload, resume: { kind: "none" } });
    expect(again).toMatchObject({ ok: false, conflict: true });
    expect(await store.listDrafts(alice.candidateId)).toHaveLength(1);
  });

  it("rejects closed, external and missing jobs without writing anything", async () => {
    const { store } = setup();
    for (const job of [{ ...openJob, acceptingApplications: false }, { ...openJob, applicationType: "EXTERNAL" as const }, null]) {
      const result = await saveApplicationDraft({ store, session: alice }, { job, payload, resume: { kind: "upload", file: pdf() } });
      expect(result).toEqual({ ok: false, error: JOB_CLOSED_MESSAGE });
    }
    expect(await store.listDrafts(alice.candidateId)).toHaveLength(0);
    expect(await store.listResumes(alice.candidateId)).toHaveLength(0);
  });

  it("rejects an invalid payload and a disallowed file type", async () => {
    const { store } = setup();
    expect(await saveApplicationDraft({ store, session: alice }, { job: openJob, payload: { step: "x" }, resume: { kind: "none" } })).toEqual({
      ok: false,
      error: DRAFT_MESSAGES.invalid,
    });
    const exe = await saveApplicationDraft(
      { store, session: alice },
      { job: openJob, payload, resume: { kind: "upload", file: { ...pdf("run.exe"), mimeType: "application/x-msdownload" } } },
    );
    expect(exe.ok).toBe(false);
    expect(await store.listResumes(alice.candidateId)).toHaveLength(0);
  });
});

describe("Detailed Apply drafts — cross-candidate isolation", () => {
  it("another candidate cannot read, edit, delete or submit a draft, or use its résumé", async () => {
    const { store } = setup();
    const saved = await saveApplicationDraft({ store, session: alice }, { job: openJob, payload, resume: { kind: "upload", file: pdf() } });
    if (!saved.ok) throw new Error(saved.error);
    const draftId = saved.draft.id;

    expect(await store.getDraft(bob.candidateId, draftId)).toBeNull();
    expect(await store.listDrafts(bob.candidateId)).toEqual([]);
    expect(
      await saveApplicationDraft({ store, session: bob }, { job: openJob, draftId, expectedRevision: 1, payload, resume: { kind: "keep" } }),
    ).toEqual({ ok: false, error: DRAFT_MESSAGES.notFound });
    expect(await deleteApplicationDraft({ store, session: bob }, draftId)).toEqual({ ok: false, error: DRAFT_MESSAGES.notFound });

    const file = vi.fn();
    expect(await submitApplicationDraft({ store, session: bob }, draftId, { isJobOpen: async () => true, file })).toEqual({
      ok: false,
      error: DRAFT_MESSAGES.notFound,
    });
    expect(file).not.toHaveBeenCalled();

    // Bob cannot point his own draft at Alice's library résumé.
    const steal = await saveApplicationDraft(
      { store, session: bob },
      { job: openJob, payload, resume: { kind: "library", documentId: saved.uploadedDocumentId! } },
    );
    expect(steal).toEqual({ ok: false, error: DRAFT_MESSAGES.resumeNotFound });
    expect(await store.resumeDownload(bob.candidateId, saved.uploadedDocumentId!)).toBeNull();

    // Alice's draft is untouched.
    expect((await store.getDraft(alice.candidateId, draftId))?.revision).toBe(1);
  });
});

describe("Detailed Apply drafts — final submission", () => {
  async function savedDraft(store: ReturnType<typeof setup>["store"]) {
    const saved = await saveApplicationDraft({ store, session: alice }, { job: openJob, payload, resume: { kind: "upload", file: pdf() } });
    if (!saved.ok) throw new Error(saved.error);
    return saved.draft;
  }

  it("files through the canonical service once and records the application on the draft", async () => {
    const { store, now } = setup();
    const draft = await savedDraft(store);
    const file = vi.fn<FileFn>(async () => ({
      ok: true as const,
      applicationId: "app-1",
      applicationNumber: "APP-2026-0001",
      candidateId: alice.candidateId,
    }));

    const result = await submitApplicationDraft({ store, session: alice, now }, draft.id, { isJobOpen: async () => true, file });
    expect(result).toEqual({ ok: true, applicationId: "app-1", applicationNumber: "APP-2026-0001", alreadySubmitted: false });
    expect(file).toHaveBeenCalledTimes(1);
    expect(file.mock.calls[0]?.[0]).toMatchObject({ resumeDocumentId: draft.resumeDocumentId, job: { requisitionId: "req-1" } });

    const after = await store.getDraft(alice.candidateId, draft.id);
    expect(after).toMatchObject({ status: "SUBMITTED", submittedApplicationId: "app-1" });
    // A submitted draft is history: not listed as unfinished, not editable, not deletable.
    expect(await store.listDrafts(alice.candidateId)).toEqual([]);
    expect((await deleteApplicationDraft({ store, session: alice }, draft.id)).ok).toBe(false);
  });

  it("a repeat submit (double click, retry) returns the same application without filing again", async () => {
    const { store, now } = setup();
    const draft = await savedDraft(store);
    const file = vi.fn(async () => ({ ok: true as const, applicationId: "app-1", applicationNumber: "APP-1", candidateId: alice.candidateId }));
    await submitApplicationDraft({ store, session: alice, now }, draft.id, { isJobOpen: async () => true, file });
    const again = await submitApplicationDraft({ store, session: alice, now }, draft.id, {
      isJobOpen: async () => true,
      file,
      applicationNumberFor: async () => "APP-1",
    });
    expect(again).toEqual({ ok: true, applicationId: "app-1", applicationNumber: "APP-1", alreadySubmitted: true });
    expect(file).toHaveBeenCalledTimes(1);
  });

  it("a closed job is re-checked at submission and leaves the draft intact", async () => {
    const { store, now } = setup();
    const draft = await savedDraft(store);
    const file = vi.fn();
    const result = await submitApplicationDraft({ store, session: alice, now }, draft.id, { isJobOpen: async () => false, file });
    expect(result).toEqual({ ok: false, error: JOB_CLOSED_MESSAGE });
    expect(file).not.toHaveBeenCalled();
    expect((await store.getDraft(alice.candidateId, draft.id))?.status).toBe("DRAFT");
  });

  it("a failed or throwing submission releases the lease so the candidate can retry the same draft", async () => {
    const { store, now } = setup();
    const draft = await savedDraft(store);
    const failing = await submitApplicationDraft({ store, session: alice, now }, draft.id, {
      isJobOpen: async () => true,
      file: async () => ({ ok: false, error: "We couldn't complete your application. Please try again." }),
    });
    expect(failing.ok).toBe(false);
    expect((await store.getDraft(alice.candidateId, draft.id))?.status).toBe("DRAFT");

    await expect(
      submitApplicationDraft({ store, session: alice, now }, draft.id, {
        isJobOpen: async () => true,
        file: async () => {
          throw new Error("network");
        },
      }),
    ).rejects.toThrow("network");
    expect((await store.getDraft(alice.candidateId, draft.id))?.status).toBe("DRAFT");
  });

  it("only one attempt holds the submission lease; an abandoned lease expires", async () => {
    const { store, now, advance } = setup();
    const draft = await savedDraft(store);
    expect(await store.beginDraftSubmission(alice.candidateId, draft.id, now())).toBe(true);

    const file = vi.fn();
    expect(await submitApplicationDraft({ store, session: alice, now }, draft.id, { isJobOpen: async () => true, file })).toEqual({
      ok: false,
      error: DRAFT_MESSAGES.inProgress,
    });
    expect(file).not.toHaveBeenCalled();

    advance(SUBMITTING_LEASE_MS + 1);
    const ok = vi.fn(async () => ({ ok: true as const, applicationId: "app-9", applicationNumber: "APP-9", candidateId: alice.candidateId }));
    expect((await submitApplicationDraft({ store, session: alice, now }, draft.id, { isJobOpen: async () => true, file: ok })).ok).toBe(true);
  });

  it("requires a résumé and contact basics before filing", async () => {
    const { store, now } = setup();
    const saved = await saveApplicationDraft(
      { store, session: alice },
      { job: openJob, payload: { ...payload, contact: { ...payload.contact, phone: "" } }, resume: { kind: "none" } },
    );
    if (!saved.ok) throw new Error(saved.error);
    const file = vi.fn();
    expect(await submitApplicationDraft({ store, session: alice, now }, saved.draft.id, { isJobOpen: async () => true, file })).toEqual({
      ok: false,
      error: DRAFT_MESSAGES.resumeMissing,
    });
    expect(file).not.toHaveBeenCalled();
  });
});

describe("draft rules", () => {
  it("decides submission state and lease expiry", () => {
    const base = {
      id: "d",
      candidateId: "c",
      job: { jobId: "j", requisitionId: "r", slug: "s", title: "t", company: "c" },
      resumeDocumentId: null,
      payload: parseDraftPayload({}),
      revision: 1,
      createdAt: "",
      updatedAt: "",
    };
    const now = new Date("2026-10-07T12:00:00Z");
    expect(decideDraftSubmission({ ...base, status: "DRAFT", submittedApplicationId: null, submittingStartedAt: null }, now)).toEqual({ action: "submit" });
    expect(
      decideDraftSubmission({ ...base, status: "SUBMITTED", submittedApplicationId: "app", submittingStartedAt: null }, now),
    ).toEqual({ action: "already-submitted", applicationId: "app" });
    expect(
      decideDraftSubmission({ ...base, status: "SUBMITTING", submittedApplicationId: null, submittingStartedAt: now.toISOString() }, now),
    ).toEqual({ action: "in-progress" });
    expect(isLeaseExpired(null, now)).toBe(true);
    expect(isLeaseExpired(new Date(now.getTime() - SUBMITTING_LEASE_MS).toISOString(), now)).toBe(true);
  });
});
