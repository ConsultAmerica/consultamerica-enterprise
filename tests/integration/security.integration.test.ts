import { beforeAll, describe, expect, it } from "vitest";

import { submitEasyApplication } from "@/lib/recruiting/easy-apply";
import { createSupabaseEasyApplyPorts } from "@/lib/recruiting/easy-apply-supabase";
import { CANDIDATE_DOCUMENTS_BUCKET } from "@/lib/storage/candidate-documents";

import { activatedCandidate, check, createJobs, pdfBytes, service, uid } from "./helpers";

/**
 * Storage + row-level security against the isolated database.
 * INTEGRATION_STAGE=pre048 documents the current (019) behavior that 048 fixes;
 * the default stage asserts the hardened behavior with 048 applied.
 */
const STAGE = process.env.INTEGRATION_STAGE ?? "full";
const db = service();

type Cand = Awaited<ReturnType<typeof activatedCandidate>>;

async function submittedApplication(cand: Cand, job: { req: string; job: string }) {
  const result = await submitEasyApplication(
    {
      requisitionId: job.req,
      postingId: job.job,
      firstName: "Test",
      lastName: "Applicant",
      email: cand.email,
      phone: "555-0100",
      source: "Integration",
      resume: { fileName: "resume.pdf", mimeType: "application/pdf", fileSize: pdfBytes().byteLength, bytes: pdfBytes() },
    },
    { ports: createSupabaseEasyApplyPorts(db), log: () => undefined },
  );
  const doc = check(await db.from("documents").select("id, storage_path").eq("id", result.resumeDocumentId).single(), "doc");
  return { ...result, storagePath: doc.storage_path as string };
}

const objectExists = async (path: string) => {
  const { data } = await db.storage.from(CANDIDATE_DOCUMENTS_BUCKET).download(path);
  return Boolean(data);
};

describe(`storage & RLS security (stage=${STAGE})`, () => {
  let a: Cand;
  let b: Cand;
  let appA: Awaited<ReturnType<typeof submittedApplication>>;
  let appB: Awaited<ReturnType<typeof submittedApplication>>;

  beforeAll(async () => {
    const { open } = await createJobs(db);
    a = await activatedCandidate(db, "sec-a");
    b = await activatedCandidate(db, "sec-b");
    appA = await submittedApplication(a, open);
    appB = await submittedApplication(b, open);
  });

  it("owner can read (preview/download) their own submitted résumé; another candidate cannot", async () => {
    expect((await a.client.storage.from(CANDIDATE_DOCUMENTS_BUCKET).download(appA.storagePath)).data).toBeTruthy();
    const signed = await a.client.storage.from(CANDIDATE_DOCUMENTS_BUCKET).createSignedUrl(appA.storagePath, 60);
    expect(signed.data?.signedUrl).toBeTruthy();
    expect((await a.client.storage.from(CANDIDATE_DOCUMENTS_BUCKET).download(appB.storagePath)).data).toBeNull();
    expect((await a.client.storage.from(CANDIDATE_DOCUMENTS_BUCKET).createSignedUrl(appB.storagePath, 60)).data).toBeNull();
  });

  it("owner can upload a new file to their own folder only", async () => {
    const own = await a.client.storage.from(CANDIDATE_DOCUMENTS_BUCKET).upload(`${a.candidateId}/doc-${uid()}/new.pdf`, pdfBytes(), { contentType: "application/pdf" });
    expect(own.error).toBeNull();
    const foreign = await a.client.storage.from(CANDIDATE_DOCUMENTS_BUCKET).upload(`${b.candidateId}/doc-${uid()}/x.pdf`, pdfBytes(), { contentType: "application/pdf" });
    expect(foreign.error).toBeTruthy();
  });

  it("14. candidate cannot delete another candidate's résumé file", async () => {
    await a.client.storage.from(CANDIDATE_DOCUMENTS_BUCKET).remove([appB.storagePath]);
    expect(await objectExists(appB.storagePath)).toBe(true);
  });

  it("documents / links of another candidate are invisible and unwritable", async () => {
    expect(check(await a.client.from("documents").select("id").eq("id", appB.resumeDocumentId), "sel")).toEqual([]);
    expect(check(await a.client.from("applications").select("id").eq("id", appB.applicationId), "sel")).toEqual([]);
    await a.client.from("documents").update({ status: "DELETED" }).eq("id", appB.resumeDocumentId);
    const docB = check(await db.from("documents").select("status").eq("id", appB.resumeDocumentId).single(), "docB");
    expect(docB.status).toBe("ACTIVE");
  });

  if (STAGE === "pre048") {
    it("FINDING (019 as deployed): the owner CAN delete the file and metadata of their own submitted résumé", async () => {
      const removed = await a.client.storage.from(CANDIDATE_DOCUMENTS_BUCKET).remove([appA.storagePath]);
      expect(removed.error).toBeNull();
      expect(await objectExists(appA.storagePath)).toBe(false);
      await a.client.from("documents").delete().eq("id", appA.resumeDocumentId);
      const link = check(await db.from("application_documents").select("id").eq("application_id", appA.applicationId), "link");
      expect(link).toEqual([]); // cascade erased the application → résumé link
    });

    it("FINDING (013 as deployed): a candidate can change the email on their own candidate record", async () => {
      const takeover = `unclaimed.${uid()}@example.test`;
      await a.client.from("candidate_profiles").update({ email: takeover }).eq("id", a.candidateId);
      const row = check(await db.from("candidate_profiles").select("email").eq("id", a.candidateId).single(), "row");
      expect(row.email).toBe(takeover);
      check(await db.from("candidate_profiles").update({ email: a.email }).eq("id", a.candidateId), "restore");
    });

    it("FINDING (019 as deployed): a candidate can attach their document to ANOTHER candidate's application", async () => {
      const ownId = `doc-${uid()}`;
      check(
        await db.from("documents").insert({
          id: ownId,
          candidate_id: a.candidateId,
          user_id: a.profileId,
          document_type: "OTHER",
          file_name: "note.pdf",
          storage_path: `${a.candidateId}/${ownId}/note.pdf`,
        }),
        "own doc",
      );
      const injected = await a.client.from("application_documents").insert({
        id: `appdoc-${uid()}`,
        application_id: appB.applicationId,
        document_id: ownId,
        document_role: "SUPPORTING",
        purpose: "SUPPORTING",
      });
      expect(injected.error).toBeNull();
    });
    return;
  }

  it("14. owner CANNOT delete or overwrite the file of their own submitted résumé", async () => {
    await a.client.storage.from(CANDIDATE_DOCUMENTS_BUCKET).remove([appA.storagePath]);
    expect(await objectExists(appA.storagePath)).toBe(true);
    const overwrite = await a.client.storage
      .from(CANDIDATE_DOCUMENTS_BUCKET)
      .upload(appA.storagePath, new TextEncoder().encode("tampered"), { upsert: true, contentType: "application/pdf" });
    expect(overwrite.error).toBeTruthy();
  });

  it("owner CANNOT delete, repoint or mark DELETED their submitted document row, or edit application links", async () => {
    await a.client.from("documents").delete().eq("id", appA.resumeDocumentId);
    await a.client.from("documents").update({ storage_path: "x/y/z.pdf", status: "DELETED" }).eq("id", appA.resumeDocumentId);
    const doc = check(await db.from("documents").select("status, storage_path").eq("id", appA.resumeDocumentId).single(), "doc");
    expect(doc).toEqual({ status: "ACTIVE", storage_path: appA.storagePath });
    await a.client.from("application_documents").delete().eq("application_id", appA.applicationId);
    const links = check(await db.from("application_documents").select("document_id").eq("application_id", appA.applicationId), "links");
    expect(links).toEqual([{ document_id: appA.resumeDocumentId }]);
  });

  it("candidate CANNOT change the email (or link) on their candidate record; can still read it", async () => {
    await a.client.from("candidate_profiles").update({ email: `unclaimed.${uid()}@example.test`, profile_id: null }).eq("id", a.candidateId);
    const row = check(await db.from("candidate_profiles").select("email, profile_id").eq("id", a.candidateId).single(), "row");
    expect(row).toEqual({ email: a.email, profile_id: a.profileId });
    expect(check(await a.client.from("candidate_profiles").select("id").eq("id", a.candidateId), "self")).toHaveLength(1);
    expect(check(await a.client.from("candidate_profiles").select("id").eq("id", b.candidateId), "other")).toEqual([]);
  });

  it("candidate CANNOT attach their document to another candidate's application", async () => {
    const injected = await a.client.from("application_documents").insert({
      id: `appdoc-${uid()}`,
      application_id: appB.applicationId,
      document_id: appA.resumeDocumentId,
      document_role: "SUPPORTING",
      purpose: "SUPPORTING",
    });
    expect(injected.error).toBeTruthy();
  });

  it("owner still reads their own document rows and application links", async () => {
    expect(check(await a.client.from("documents").select("id").eq("id", appA.resumeDocumentId), "own")).toHaveLength(1);
    expect(check(await a.client.from("application_documents").select("document_id").eq("application_id", appA.applicationId), "links")).toHaveLength(1);
  });

  it("submitted documents are protected even from the server: no hard delete, no DELETED, no file removal — archiving allowed", async () => {
    const del = await db.from("documents").delete().eq("id", appA.resumeDocumentId);
    expect(del.error?.message).toMatch(/submitted application/);
    const mark = await db.from("documents").update({ status: "DELETED" }).eq("id", appA.resumeDocumentId);
    expect(mark.error?.message).toMatch(/only archiving/);
    const archive = await db
      .from("documents")
      .update({ status: "ARCHIVED", is_primary_resume: false, archived_at: new Date().toISOString() })
      .eq("id", appA.resumeDocumentId);
    expect(archive.error).toBeNull();
    const removed = await db.storage.from(CANDIDATE_DOCUMENTS_BUCKET).remove([appA.storagePath]);
    expect(removed.error).toBeTruthy();
    expect(await objectExists(appA.storagePath)).toBe(true);
  });

  it("an unsubmitted library file can still be removed by the server", async () => {
    const path = `${a.candidateId}/doc-${uid()}/library.pdf`;
    check(await db.storage.from(CANDIDATE_DOCUMENTS_BUCKET).upload(path, pdfBytes(), { contentType: "application/pdf" }), "up");
    const removed = await db.storage.from(CANDIDATE_DOCUMENTS_BUCKET).remove([path]);
    expect(removed.error).toBeNull();
    expect(await objectExists(path)).toBe(false);
  });

  it("drafts (046): owner reads/deletes only their own; no direct inserts; other candidate sees nothing", async () => {
    const { open } = await createJobs(db);
    const draftId = `draft-${uid()}`;
    check(
      await db.from("application_drafts").insert({
        id: draftId,
        candidate_id: a.candidateId,
        job_id: open.job,
        requisition_id: open.req,
        job_snapshot: { jobId: open.job, requisitionId: open.req, slug: open.slug, title: "t", company: "c" },
        payload: {},
      }),
      "draft",
    );
    expect(check(await a.client.from("application_drafts").select("id").eq("id", draftId), "own")).toHaveLength(1);
    expect(check(await b.client.from("application_drafts").select("id").eq("id", draftId), "other")).toEqual([]);
    await b.client.from("application_drafts").delete().eq("id", draftId);
    expect(check(await db.from("application_drafts").select("id").eq("id", draftId), "still")).toHaveLength(1);
    const direct = await a.client.from("application_drafts").insert({
      id: `draft-${uid()}`,
      candidate_id: a.candidateId,
      job_id: open.job,
      requisition_id: open.req,
      job_snapshot: {},
    });
    expect(direct.error).toBeTruthy();
    await a.client.from("application_drafts").delete().eq("id", draftId);
    expect(check(await db.from("application_drafts").select("id").eq("id", draftId), "gone")).toEqual([]);
  });
});
