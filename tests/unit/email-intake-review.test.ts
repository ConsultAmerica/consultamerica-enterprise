import { describe, expect, it, vi } from "vitest";

import { ASSISTANT_TOOLS, executeAssistantTool } from "@/lib/assistant/tools";
import { syncEmailIntake } from "@/lib/email-intake/pipeline";
import { createMockProvider } from "@/lib/email-intake/mock-provider";
import { createMemoryIntakeRepository } from "@/lib/email-intake/repository";
import { approveAsDraft, dismiss, linkToRequisition, type ReviewDeps } from "@/lib/email-intake/review";
import { createRulesIntakeExtractor } from "@/lib/email-intake/rules-extractor";
import type { CreateJobRequisitionInput } from "@/lib/recruiting/repository";

const actor = { profileId: "profile-recruiter", displayName: "Rae Recruiter" };

async function setup() {
  const repo = createMemoryIntakeRepository();
  await syncEmailIntake({
    provider: createMockProvider(),
    repo,
    ai: createRulesIntakeExtractor(),
    recruiting: { listRequisitions: async () => [], listJobs: async () => [] },
    workerId: "w",
    initialSyncAfter: new Date("2026-10-01T00:00:00Z"),
    allowedSenders: [],
    now: () => new Date("2026-10-07T12:00:00Z"),
  });
  const created: CreateJobRequisitionInput[] = [];
  const activities: string[] = [];
  const deps: ReviewDeps = {
    repo,
    createDraftRequisition: vi.fn(async (input) => {
      created.push(input);
      return { requisitionId: `req-${created.length}` };
    }),
    requisitionExists: async (id) => id.startsWith("req-"),
    recordRequisitionActivity: async (a) => void activities.push(a.activityType),
  };
  const find = (subject: string) => [...repo.messages.values()].find((m) => m.subject === subject)!;
  return { repo, deps, created, activities, find };
}

const valid = {
  title: "Oracle Integration Developer",
  departmentId: "dept-oracle",
  departmentName: "Oracle Consulting",
  positionId: "pos-oracle-scm",
  locationId: "loc-md",
  locationName: "Maryland",
  employmentType: "FULL_TIME",
  workplaceType: "HYBRID",
  careerArea: "technology-oracle",
  description: "Oracle Integration Developer for OIC, REST and SOAP integrations.",
  responsibilities: [],
  qualifications: ["OIC", "REST", "SOAP"],
  preferredQualifications: [],
  acknowledgeDuplicates: false,
};

describe("job intake review", () => {
  it("13/14. intake creates review items and never publishes anything by itself", async () => {
    const { repo, created } = await setup();
    expect([...repo.messages.values()].some((m) => m.processingStatus === "REVIEW_REQUIRED")).toBe(true);
    expect(created).toHaveLength(0);
    expect([...repo.messages.values()].every((m) => m.linkedRequisitionId === null)).toBe(true);
  });

  it("15. recruiter approval creates exactly one DRAFT requisition with publishNow=false", async () => {
    const { deps, created, activities, find } = await setup();
    const item = find("Oracle Integration Developer Needed");
    const result = await approveAsDraft(item.id, valid, actor, deps);
    expect(result.ok).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].publishNow).toBe(false);
    expect(activities).toContain("REQUISITION_DRAFTED_FROM_EMAIL");
    if (result.ok) {
      expect(result.intake.processingStatus).toBe("DRAFTED");
      expect(result.intake.linkedRequisitionId).toBe("req-1");
    }
  });

  it("16. a second approval of the same email cannot create a second draft", async () => {
    const { deps, created, find } = await setup();
    const item = find("Oracle Integration Developer Needed");
    await approveAsDraft(item.id, valid, actor, deps);
    const again = await approveAsDraft(item.id, valid, actor, deps);
    expect(again.ok).toBe(false);
    expect(created).toHaveLength(1);
  });

  it("requires acknowledging possible duplicates before drafting", async () => {
    const { deps, created, find } = await setup();
    const update = find("RE: Oracle Integration Developer Needed"); // has a SAME_THREAD signal
    const blocked = await approveAsDraft(update.id, valid, actor, deps);
    expect(blocked.ok).toBe(false);
    expect(created).toHaveLength(0);
    const allowed = await approveAsDraft(update.id, { ...valid, acknowledgeDuplicates: true }, actor, deps);
    expect(allowed.ok).toBe(true);
  });

  it("restores the item if the draft requisition cannot be created", async () => {
    const { deps, find, repo } = await setup();
    deps.createDraftRequisition = async () => {
      throw new Error("db down");
    };
    const item = find("Oracle Integration Developer Needed");
    const result = await approveAsDraft(item.id, valid, actor, deps);
    expect(result.ok).toBe(false);
    expect((await repo.get(item.id))?.processingStatus).toBe("REVIEW_REQUIRED");
  });

  it("linking records the association without modifying the requisition", async () => {
    const { deps, created, find, activities } = await setup();
    const update = find("RE: Oracle Integration Developer Needed");
    const result = await linkToRequisition(update.id, "req-existing", actor, deps);
    expect(result.ok).toBe(true);
    expect(created).toHaveLength(0);
    expect(activities).toContain("INTAKE_EMAIL_LINKED");
  });

  it("ignore / not-a-job are audited recruiter decisions", async () => {
    const { deps, repo, find } = await setup();
    const item = find("Quick question");
    const result = await dismiss(item.id, "NOT_A_JOB", null, actor, deps);
    expect(result.ok && result.intake.classificationSource).toBe("RECRUITER");
    expect(repo.events.some((e) => e.eventType === "MARKED_NOT_A_JOB" && e.actorProfileId === actor.profileId)).toBe(true);
  });

  it("rejects incomplete approvals", async () => {
    const { deps, find } = await setup();
    const result = await approveAsDraft(find("Oracle Integration Developer Needed").id, { ...valid, departmentId: "" }, actor, deps);
    expect(result.ok).toBe(false);
  });

  it("18. the public assistant has no tool that can reach intake, email or candidates", async () => {
    const names = ASSISTANT_TOOLS.map((t) => t.name);
    expect(names).toEqual(["search_public_jobs", "get_public_job", "get_company_information", "get_career_information", "get_application_guidance"]);
    for (const forbidden of ["list_intake", "read_email", "search_candidates", "get_resume", "sql"]) {
      const out = await executeAssistantTool(forbidden, {}, { jobs: { search: vi.fn(), get: vi.fn() } });
      expect(out.isError).toBe(true);
    }
  });
});
