import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => undefined }));

import { saveApplicationDraft, submitApplicationDraft } from "@/lib/candidate-portal/draft-service";
import { createSupabaseCandidatePortalStore } from "@/lib/candidate-portal/store-supabase";
import type { CandidateSession } from "@/lib/candidate-portal/types";
import { submitEasyApplication } from "@/lib/recruiting/easy-apply";
import { createSupabaseEasyApplyPorts } from "@/lib/recruiting/easy-apply-supabase";
import { JobClosedError } from "@/lib/recruiting/errors";

import { activatedCandidate, check, createJobs, pdfBytes, service, testEmail } from "./helpers";

const db = service();
const ports = createSupabaseEasyApplyPorts(db);
const quiet = { ports, log: () => undefined };

describe("applications against the isolated database", () => {
  let jobs: Awaited<ReturnType<typeof createJobs>>;
  let a: Awaited<ReturnType<typeof activatedCandidate>>;
  let b: Awaited<ReturnType<typeof activatedCandidate>>;
  let sessionA: CandidateSession;
  let sessionB: CandidateSession;
  const store = createSupabaseCandidatePortalStore(db);

  beforeAll(async () => {
    jobs = await createJobs(db);
    a = await activatedCandidate(db, "app-a");
    b = await activatedCandidate(db, "app-b");
    sessionA = { candidateId: a.candidateId, profileId: a.profileId, email: a.email, displayName: "A", demo: false };
    sessionB = { candidateId: b.candidateId, profileId: b.profileId, email: b.email, displayName: "B", demo: false };
  });

  const draftJob = () => ({
    jobId: jobs.open.job,
    requisitionId: jobs.open.req,
    slug: jobs.open.slug,
    title: "Integration Engineer",
    company: "Consult America",
    acceptingApplications: true,
    applicationType: "INTERNAL" as const,
  });
  const payload = {
    contact: { firstName: "Alex", lastName: "Applicant", phone: "555-0101", location: "Austin, TX", linkedinUrl: "", portfolioUrl: "" },
    profile: { summary: "s", skills: ["TypeScript"], experience: [], education: [], certifications: [], portfolioUrl: "" },
    answers: [],
    step: 2,
  };

  it("5. résumé upload into the private library (Supabase storage + documents)", async () => {
    const { documentId } = await store.uploadResume(
      a.candidateId,
      { fileName: "library.pdf", mimeType: "application/pdf", fileSize: pdfBytes().byteLength, bytes: pdfBytes() },
      { makeDefault: true },
    );
    const list = await store.listResumes(a.candidateId);
    expect(list).toMatchObject([{ documentId, isDefault: true, status: "ACTIVE", applicationCount: 0, parse: { state: "PENDING" } }]);
    // 6. preview/download: short-lived signed URL that actually serves the file
    const dl = await store.resumeDownload(a.candidateId, documentId);
    expect(dl?.kind).toBe("redirect");
    const res = await fetch((dl as { url: string }).url);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer()).byteLength).toBe(pdfBytes().byteLength);
    expect(await store.resumeDownload(b.candidateId, documentId)).toBeNull();
  });

  it("7/8/9/10. save draft → restore (new session) → submit → Candidate → Application → Document", async () => {
    const [resume] = await store.listResumes(a.candidateId);
    const saved = await saveApplicationDraft(
      { store, session: sessionA },
      { job: draftJob(), payload, resume: { kind: "library", documentId: resume!.documentId } },
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(check(await db.from("applications").select("id").eq("candidate_id", a.candidateId), "none yet")).toEqual([]);

    // restore after sign-out/sign-in = a fresh store/session reading the same row
    const restored = await createSupabaseCandidatePortalStore(service()).findOpenDraft(a.candidateId, jobs.open.req);
    expect(restored).toMatchObject({ id: saved.draft.id, revision: 1, resumeDocumentId: resume!.documentId });
    expect(restored?.payload.contact.phone).toBe("555-0101");
    expect(restored?.payload.step).toBe(2);
    expect(await store.findOpenDraft(b.candidateId, jobs.open.req)).toBeNull();
    expect(await store.getDraft(b.candidateId, saved.draft.id)).toBeNull();

    const fileOnce = vi.fn(async (draft: { resumeDocumentId: string; payload: typeof payload }) => {
      const r = await submitEasyApplication(
        {
          requisitionId: jobs.open.req,
          postingId: jobs.open.job,
          firstName: draft.payload.contact.firstName,
          lastName: draft.payload.contact.lastName,
          email: a.email,
          phone: draft.payload.contact.phone,
          source: "Careers Site — Detailed Apply",
          sessionCandidateId: a.candidateId,
          libraryResumeDocumentId: draft.resumeDocumentId,
        },
        quiet,
      );
      return { ok: true as const, applicationId: r.applicationId, applicationNumber: r.applicationNumber, candidateId: r.candidateId };
    });
    const submitted = await submitApplicationDraft({ store, session: sessionA }, saved.draft.id, {
      isJobOpen: async () => true,
      file: fileOnce as never,
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;

    const app = check(await db.from("applications").select("candidate_id, requisition_id, job_id, status").eq("id", submitted.applicationId).single(), "app");
    expect(app).toEqual({ candidate_id: a.candidateId, requisition_id: jobs.open.req, job_id: jobs.open.job, status: "APPLIED" });
    const links = check(await db.from("application_documents").select("document_id, document_role").eq("application_id", submitted.applicationId), "links");
    expect(links).toEqual([{ document_id: resume!.documentId, document_role: "RESUME" }]);
    const doc = check(await db.from("documents").select("candidate_id, status").eq("id", resume!.documentId).single(), "doc");
    expect(doc).toEqual({ candidate_id: a.candidateId, status: "ACTIVE" });
    const draftRow = check(await db.from("application_drafts").select("status, submitted_application_id").eq("id", saved.draft.id).single(), "draft");
    expect(draftRow).toEqual({ status: "SUBMITTED", submitted_application_id: submitted.applicationId });
    expect((await store.listApplications(a.candidateId)).map((x) => x.applicationId)).toEqual([submitted.applicationId]);

    // 12. duplicate submit of the same draft: same application, no second filing
    const again = await submitApplicationDraft({ store, session: sessionA }, saved.draft.id, { isJobOpen: async () => true, file: fileOnce as never });
    expect(again).toMatchObject({ ok: true, applicationId: submitted.applicationId, alreadySubmitted: true });
    expect(fileOnce).toHaveBeenCalledTimes(1);
    // ...and a fresh canonical submission for the same job returns the existing application
    const direct = await submitEasyApplication(
      { requisitionId: jobs.open.req, postingId: jobs.open.job, firstName: "Alex", lastName: "A", email: a.email, sessionCandidateId: a.candidateId, libraryResumeDocumentId: resume!.documentId },
      quiet,
    );
    expect(direct).toMatchObject({ outcome: "existing", applicationId: submitted.applicationId });
    expect(check(await db.from("applications").select("id").eq("candidate_id", a.candidateId), "count")).toHaveLength(1);
  });

  it("11. retry after a submission failure completes without duplicates or orphans", async () => {
    const email = testEmail("retry");
    const input = {
      requisitionId: jobs.open.req,
      postingId: jobs.open.job,
      firstName: "Retry",
      lastName: "Case",
      email,
      resume: { fileName: "r.pdf", mimeType: "application/pdf", fileSize: pdfBytes().byteLength, bytes: pdfBytes() },
    };
    let failLink = true;
    const flaky = {
      ...ports,
      async linkResume(args: Parameters<typeof ports.linkResume>[0]) {
        if (failLink) {
          failLink = false;
          throw new Error("injected link failure");
        }
        return ports.linkResume(args);
      },
    };
    await expect(submitEasyApplication(input, { ports: flaky, log: () => undefined })).rejects.toMatchObject({ stage: "document-link" });
    const cand = check(await db.from("candidate_profiles").select("id").ilike("email", email).single(), "cand");
    expect(check(await db.from("applications").select("id").eq("candidate_id", cand.id), "compensated")).toEqual([]);
    expect(check(await db.from("documents").select("id").eq("candidate_id", cand.id), "no orphan doc")).toEqual([]);

    const retry = await submitEasyApplication(input, { ports: flaky, log: () => undefined });
    expect(retry.outcome).toBe("created");
    expect(check(await db.from("applications").select("id").eq("candidate_id", cand.id), "one app")).toHaveLength(1);
    expect(check(await db.from("application_documents").select("id").eq("application_id", retry.applicationId), "linked")).toHaveLength(1);
  });

  it("closed job: canonical service refuses, draft stays a draft", async () => {
    await expect(
      submitEasyApplication(
        { requisitionId: jobs.closed.req, postingId: jobs.closed.job, firstName: "X", lastName: "Y", email: testEmail("closed"), resume: { fileName: "r.pdf", mimeType: "application/pdf", fileSize: 4, bytes: pdfBytes() } },
        quiet,
      ),
    ).rejects.toBeInstanceOf(JobClosedError);
    const saved = await saveApplicationDraft(
      { store, session: sessionB },
      { job: { ...draftJob(), jobId: jobs.closed.job, requisitionId: jobs.closed.req, slug: jobs.closed.slug, acceptingApplications: false }, payload, resume: { kind: "none" } },
    );
    expect(saved).toMatchObject({ ok: false });
  });

  it("13. another candidate cannot use A's library résumé through the canonical service", async () => {
    const [resumeA] = await store.listResumes(a.candidateId);
    await expect(
      submitEasyApplication(
        { requisitionId: jobs.open.req, postingId: jobs.open.job, firstName: "B", lastName: "B", email: b.email, sessionCandidateId: b.candidateId, libraryResumeDocumentId: resumeA!.documentId },
        quiet,
      ),
    ).rejects.toMatchObject({ stage: "document-metadata" });
    expect(check(await db.from("applications").select("id").eq("candidate_id", b.candidateId), "none")).toEqual([]);
  });

  it("15. anonymous Easy Apply (public action) still files a complete application without an account", async () => {
    const { submitJobApplication } = await import("@/lib/recruiting/actions");
    const email = testEmail("anon");
    const form = new FormData();
    form.set("resume", new File([pdfBytes()], "anon.pdf", { type: "application/pdf" }));
    const result = await submitJobApplication(
      { requisitionId: jobs.open.req, postingId: jobs.open.job, firstName: "Anon", lastName: "Applicant", email, phone: "555-0199" },
      form,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const app = check(await db.from("applications").select("candidate_id").eq("id", result.applicationId).single(), "app");
    const links = check(await db.from("application_documents").select("document_id").eq("application_id", result.applicationId), "links");
    expect(links).toHaveLength(1);
    const cand = check(await db.from("candidate_profiles").select("email, profile_id").eq("id", app.candidate_id).single(), "cand");
    expect(cand.email).toBe(email);
    expect(cand.profile_id).toBeTruthy(); // invitation sent; the account stays unusable until the inbox owner opens it
  });
});
