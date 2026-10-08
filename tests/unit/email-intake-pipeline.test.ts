import { describe, expect, it } from "vitest";

import { validateExtraction } from "@/lib/email-intake/extraction";
import { createMockProvider, mockEmails, type MockEmail } from "@/lib/email-intake/mock-provider";
import { syncEmailIntake, type IntakeAI, type PipelineDeps } from "@/lib/email-intake/pipeline";
import { createMemoryIntakeRepository } from "@/lib/email-intake/repository";
import { createRulesIntakeExtractor } from "@/lib/email-intake/rules-extractor";
import { fieldText } from "@/lib/email-intake/extraction";

const START = new Date("2026-10-01T00:00:00Z");

function setup(options: { emails?: MockEmail[]; ai?: IntakeAI | null; failListing?: () => boolean; failContentFor?: Set<string>; requisitions?: { id: string; title: string; locationName: string | null; status: string }[]; allowedSenders?: string[] } = {}) {
  const repo = createMemoryIntakeRepository();
  const provider = createMockProvider(options.emails ?? mockEmails(), { failListing: options.failListing, failContentFor: options.failContentFor });
  let clock = new Date("2026-10-07T12:00:00Z");
  const deps: PipelineDeps = {
    provider,
    repo,
    ai: options.ai === undefined ? createRulesIntakeExtractor() : options.ai,
    recruiting: { listRequisitions: async () => options.requisitions ?? [], listJobs: async () => [] },
    workerId: "test-worker",
    initialSyncAfter: START,
    allowedSenders: options.allowedSenders ?? [],
    now: () => clock,
  };
  return { repo, provider, deps, advance: (ms: number) => (clock = new Date(clock.getTime() + ms)) };
}

const bySubject = (repo: ReturnType<typeof createMemoryIntakeRepository>, subject: string) =>
  [...repo.messages.values()].find((m) => m.subject === subject)!;

describe("email intake pipeline", () => {
  it("1. turns a relevant job email into a REVIEW_REQUIRED item with evidence-backed fields", async () => {
    const { repo, deps } = setup();
    await syncEmailIntake(deps);
    const m = bySubject(repo, "Oracle Integration Developer Needed");
    expect(m.classification).toBe("JOB_REQUIREMENT");
    expect(m.processingStatus).toBe("REVIEW_REQUIRED");
    expect(fieldText(m.extraction?.fields.title)).toMatch(/Oracle Integration Developer/i);
    expect(fieldText(m.extraction?.fields.location)).toBe("Baltimore, MD");
    expect(fieldText(m.extraction?.fields.workArrangement)).toBe("Hybrid");
    expect(m.extraction?.fields.requiredSkills.value).toEqual(expect.arrayContaining(["OIC", "REST", "SOAP"]));
    for (const f of Object.values(m.extraction!.fields)) {
      if (f.status !== "MISSING") expect(m.normalizedText!.toLowerCase().replace(/\s+/g, " ")).toContain(f.evidence!.toLowerCase().replace(/\s+/g, " ").slice(0, 20));
    }
  });

  it("2. files a confident non-recruiting email under Ignored (still visible)", async () => {
    const { repo, deps } = setup();
    await syncEmailIntake(deps);
    const m = bySubject(repo, "October product newsletter");
    expect(m.classification).toBe("NON_RECRUITING");
    expect(m.processingStatus).toBe("IGNORED");
  });

  it("3. sends an ambiguous email to human review instead of ignoring it", async () => {
    const { repo, deps } = setup();
    await syncEmailIntake(deps);
    const m = bySubject(repo, "Quick question");
    expect(["UNKNOWN", "GENERAL_RECRUITING"]).toContain(m.classification);
    expect(m.processingStatus).toBe("REVIEW_REQUIRED");
  });

  it("4. never creates duplicate records when the same messages are synced twice", async () => {
    const { repo, deps } = setup();
    await syncEmailIntake(deps);
    const first = repo.messages.size;
    const second = await syncEmailIntake(deps);
    expect(repo.messages.size).toBe(first);
    expect(second.ingested).toBe(0);
  });

  it("5. treats a same-thread reply as a JOB_UPDATE linked to the earlier requirement", async () => {
    const { repo, deps } = setup();
    await syncEmailIntake(deps);
    const update = bySubject(repo, "RE: Oracle Integration Developer Needed");
    expect(update.classification).toBe("JOB_UPDATE");
    expect(update.duplicateSignals.some((s) => s.kind === "SAME_THREAD")).toBe(true);
    expect(fieldText(update.extraction?.fields.workArrangement)).toBe("Remote");
  });

  it("6. reads a supported attachment as part of the requirement", async () => {
    const { repo, deps } = setup();
    await syncEmailIntake(deps);
    const m = bySubject(repo, "Requirement: Senior Data Engineer (JD attached)");
    const txt = m.attachments.find((a) => a.name.endsWith(".txt"))!;
    expect(txt.status).toBe("EXTRACTED");
    expect(m.normalizedText).toContain("Must have: Python, SQL, Spark, AWS");
    expect(m.extraction?.fields.requiredSkills.value).toEqual(expect.arrayContaining(["Python", "SQL", "Spark", "AWS"]));
  });

  it("7. rejects a malformed attachment without failing the message", async () => {
    const { repo, deps } = setup();
    await syncEmailIntake(deps);
    const m = bySubject(repo, "Requirement: Senior Data Engineer (JD attached)");
    const pdf = m.attachments.find((a) => a.name === "broken-scan.pdf")!;
    expect(pdf.status).toBe("REJECTED");
    expect(pdf.reason).toBe("type mismatch");
    expect(m.processingStatus).toBe("REVIEW_REQUIRED");
  });

  it("8. a provider outage fails the sync without moving the cursor or ingesting anything", async () => {
    const { repo, deps } = setup({ failListing: () => true });
    const summary = await syncEmailIntake(deps);
    expect(summary.status).toBe("FAILED");
    expect(repo.messages.size).toBe(0);
    const source = await repo.getSource("mock:mock-account:mock-job-requirements");
    expect(source?.syncCursorReceivedAt).toBeNull();
    expect(source?.consecutiveFailures).toBe(1);
  });

  it("9. retries a message that failed processing, with backoff, until it succeeds", async () => {
    const failing = new Set(["m-1001"]);
    const { repo, deps, advance } = setup({ failContentFor: failing });
    await syncEmailIntake(deps);
    let m = bySubject(repo, "Oracle Integration Developer Needed");
    expect(m.processingStatus).toBe("FAILED");
    expect(m.nextAttemptAt).not.toBeNull();

    failing.clear();
    await syncEmailIntake(deps); // not due yet
    expect(bySubject(repo, "Oracle Integration Developer Needed").processingStatus).toBe("FAILED");
    advance(2 * 60_000);
    await syncEmailIntake(deps);
    m = bySubject(repo, "Oracle Integration Developer Needed");
    expect(m.processingStatus).toBe("REVIEW_REQUIRED");
    expect(m.attemptCount).toBe(2);
  });

  it("10. flags a possible duplicate of an existing requisition (never merges)", async () => {
    const { repo, deps } = setup({ requisitions: [{ id: "req-x", title: "Oracle Integration Developer", locationName: "Baltimore, MD", status: "PUBLISHED" }] });
    await syncEmailIntake(deps);
    const m = bySubject(repo, "Oracle Integration Developer Needed");
    expect(m.duplicateSignals.some((s) => s.kind === "SIMILAR_REQUISITION" && s.reference === "req-x")).toBe(true);
    expect(m.processingStatus).toBe("REVIEW_REQUIRED");
  });

  it("11. AI output without supporting quotes is removed, not stored", () => {
    const sources = { subject: "Need a senior OIC consultant", body: "Need a senior OIC consultant in Baltimore.", attachments: "", thread: "" };
    const out = validateExtraction(
      {
        title: { value: "Senior OIC Consultant", status: "EXPLICIT", evidence: "senior OIC consultant", source: "body", confidence: 0.9 },
        location: { value: "Baltimore", status: "EXPLICIT", evidence: "in Baltimore", source: "body", confidence: 0.9 },
        compensation: { value: "$150,000", status: "INFERRED", evidence: "senior OIC consultant", source: "body", confidence: 0.4 },
        workArrangement: { value: "Hybrid", status: "EXPLICIT", evidence: "hybrid role", source: "body", confidence: 0.6 },
        minimumExperience: { value: "8 years", status: "INFERRED", evidence: null, source: null, confidence: 0.3 },
      },
      sources,
    );
    expect(out.fields.title.status).toBe("EXPLICIT");
    expect(out.fields.location.value).toBe("Baltimore");
    expect(out.fields.compensation.status).toBe("MISSING");
    expect(out.fields.workArrangement.status).toBe("MISSING");
    expect(out.fields.minimumExperience.status).toBe("MISSING");
    expect(out.warnings.length).toBeGreaterThanOrEqual(3);
  });

  it("12. instructions inside an email have no authority: it is only queued for human review", async () => {
    const { repo, deps } = setup();
    await syncEmailIntake(deps);
    const m = bySubject(repo, "Need a QA Analyst");
    expect(m.processingStatus).toBe("REVIEW_REQUIRED");
    expect(m.linkedRequisitionId).toBeNull();
    expect(repo.events.some((e) => e.eventType === "DRAFT_CREATED")).toBe(false);
    // The rules extractor never guesses pay from text that "instructs" it.
    expect(m.extraction?.fields.compensation.status).toBe("MISSING");
  });

  it("13. never ingests mail received before the initial sync window", async () => {
    const old: MockEmail = { ...mockEmails()[0], providerMessageId: "m-old", receivedAt: "2026-09-01T00:00:00.000Z" };
    const { repo, deps } = setup({ emails: [old] });
    await syncEmailIntake(deps);
    expect(repo.messages.size).toBe(0);
  });

  it("14. skips senders that are not on the allowlist", async () => {
    const { repo, deps } = setup({ allowedSenders: ["@partner-one.example"] });
    const summary = await syncEmailIntake(deps);
    expect([...repo.messages.values()].every((m) => m.fromAddress?.endsWith("@partner-one.example"))).toBe(true);
    expect(summary.skipped).toBeGreaterThan(0);
  });

  it("15. a second concurrent sync is refused by the lock", async () => {
    const { repo, deps } = setup();
    await repo.ensureSource({ id: "mock:mock-account:mock-job-requirements", provider: "mock", providerAccountId: "mock-account", providerFolderId: "mock-job-requirements", mailboxAddress: null, folderName: null, initialSyncAfter: START.toISOString() });
    await repo.acquireSyncLock("mock:mock-account:mock-job-requirements", "other", new Date("2026-10-07T12:30:00Z"), new Date("2026-10-07T12:00:00Z"));
    expect((await syncEmailIntake(deps)).status).toBe("LOCKED");
  });
});
