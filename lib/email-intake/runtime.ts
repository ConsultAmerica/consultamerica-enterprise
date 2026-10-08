import "server-only";

import { getSupabaseServiceClient } from "@/app/lib/supabase/server";
import { createClaudeIntakeAI } from "@/lib/email-intake/ai";
import { readIntakeConfig, type IntakeConfig } from "@/lib/email-intake/config";
import { createMockProvider } from "@/lib/email-intake/mock-provider";
import type { IntakeAI, RecruitingLookup } from "@/lib/email-intake/pipeline";
import type { EmailIntakeProvider } from "@/lib/email-intake/provider";
import { createMemoryIntakeRepository, type IntakeRepository } from "@/lib/email-intake/repository";
import type { ReviewDeps } from "@/lib/email-intake/review";
import { createRulesIntakeExtractor } from "@/lib/email-intake/rules-extractor";
import { createSupabaseIntakeRepository } from "@/lib/email-intake/supabase-repository";
import { createZohoProvider } from "@/lib/email-intake/zoho/provider";
import { createMemoryRecruitingRepository, recruitingRepository } from "@/lib/recruiting";

/**
 * Wires intake for the current mode:
 *   mock — in-memory intake store, synthetic mailbox, and DRAFTS GO TO AN
 *          IN-MEMORY RECRUITING REPO (never the database). Refused in production.
 *   zoho — Supabase intake tables + Zoho Mail provider.
 *   off  — Supabase intake tables (review existing items); no sync.
 */
export type IntakeRuntime = {
  config: IntakeConfig;
  repo: IntakeRepository;
  provider: EmailIntakeProvider | null;
  ai: IntakeAI;
  recruiting: RecruitingLookup;
  review: Omit<ReviewDeps, "now">;
  referenceData(): Promise<{ departments: Option[]; locations: Option[]; positions: (Option & { departmentId: string })[]; requisitions: Option[] }>;
};

export type Option = { id: string; name: string };

let mockRuntime: IntakeRuntime | null = null;

export function getIntakeRuntime(): IntakeRuntime {
  const config = readIntakeConfig();
  const ai = createClaudeIntakeAI() ?? createRulesIntakeExtractor();

  if (config.mode === "mock") {
    if (mockRuntime) return mockRuntime;
    const repo = createMemoryIntakeRepository();
    const recruiting = createMemoryRecruitingRepository();
    const draftIds: { id: string; title: string }[] = [];
    mockRuntime = {
      config,
      repo,
      provider: createMockProvider(),
      ai,
      recruiting: {
        async listRequisitions() {
          return (await recruiting.listJobSummaries()).map((j) => ({ id: j.requisitionId, title: j.title, locationName: j.locationName, status: j.status }));
        },
        async listJobs() {
          return [];
        },
      },
      review: {
        repo,
        async createDraftRequisition(input) {
          const { requisitionId } = await recruiting.createJobRequisition({ ...input, publishNow: false });
          draftIds.push({ id: requisitionId, title: input.title });
          return { requisitionId };
        },
        async requisitionExists(id) {
          return Boolean(await recruiting.getJobDetail(id));
        },
        async recordRequisitionActivity() {},
      },
      async referenceData() {
        const { seedDepartments, seedLocations, seedPositions } = await import("@/data/recruiting/seed");
        return {
          departments: seedDepartments.map((d) => ({ id: d.id, name: d.name })),
          locations: seedLocations.map((l) => ({ id: l.id, name: l.name })),
          positions: seedPositions.map((p) => ({ id: p.id, name: p.title, departmentId: p.departmentId })),
          requisitions: (await recruiting.listJobSummaries()).map((j) => ({ id: j.requisitionId, name: `${j.title} (${j.requisitionNumber})` })),
        };
      },
    };
    return mockRuntime;
  }

  const client = getSupabaseServiceClient();
  if (!client) throw new Error("Email intake requires Supabase (or EMAIL_INTAKE_MODE=mock in development).");
  const repo = createSupabaseIntakeRepository(client);

  return {
    config,
    repo,
    provider: config.mode === "zoho" && config.zoho ? createZohoProvider(config.zoho) : null,
    ai,
    recruiting: {
      async listRequisitions() {
        const { data, error } = await client.from("job_requisitions").select("id, title, status, locations(name)").limit(1000);
        if (error) throw new Error(`requisition lookup failed (${error.code})`);
        return (data ?? []).map((r) => ({
          id: r.id as string,
          title: r.title as string,
          status: r.status as string,
          locationName: ((r as { locations?: { name?: string } | null }).locations?.name as string) ?? null,
        }));
      },
      async listJobs() {
        const { data, error } = await client.from("jobs").select("id, title, status, location_name").eq("is_demo", false).limit(1000);
        if (error) throw new Error(`job lookup failed (${error.code})`);
        return (data ?? []).map((j) => ({ id: j.id as string, title: j.title as string, status: j.status as string, locationName: (j.location_name as string) ?? null }));
      },
    },
    review: {
      repo,
      async createDraftRequisition(input) {
        const { requisitionId } = await recruitingRepository.createJobRequisition({ ...input, publishNow: false });
        return { requisitionId };
      },
      async requisitionExists(id) {
        const { data } = await client.from("job_requisitions").select("id").eq("id", id).maybeSingle();
        return Boolean(data);
      },
      async recordRequisitionActivity(input) {
        const { error } = await client.from("recruiting_activities").insert({
          id: `act-${crypto.randomUUID()}`,
          requisition_id: input.requisitionId,
          activity_type: input.activityType,
          summary: input.summary,
          created_by_user_id: input.actorProfileId,
          created_at: new Date().toISOString(),
        });
        if (error) console.error("[zoho-job-intake]", { event: "activity-write-failed", code: error.code });
      },
    },
    async referenceData() {
      const [departments, locations, positions, requisitions] = await Promise.all([
        client.from("departments").select("id, name").order("name"),
        client.from("locations").select("id, name").order("name"),
        client.from("positions").select("id, title, department_id").order("title"),
        client.from("job_requisitions").select("id, title, requisition_number, status").not("status", "in", "(CANCELLED,FILLED)").order("created_at", { ascending: false }).limit(200),
      ]);
      return {
        departments: (departments.data ?? []).map((d) => ({ id: d.id as string, name: d.name as string })),
        locations: (locations.data ?? []).map((l) => ({ id: l.id as string, name: l.name as string })),
        positions: (positions.data ?? []).map((p) => ({ id: p.id as string, name: p.title as string, departmentId: p.department_id as string })),
        requisitions: (requisitions.data ?? []).map((r) => ({ id: r.id as string, name: `${r.title} (${r.requisition_number})` })),
      };
    },
  };
}

export const intakeLog = (event: Record<string, unknown>) => console.info("[zoho-job-intake]", event);
