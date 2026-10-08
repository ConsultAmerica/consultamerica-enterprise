import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

import { runAssistant, SYSTEM_PROMPT, type AssistantLogEvent } from "@/lib/assistant/engine";
import { executeAssistantTool, type PublicJobDetail, type PublicJobSource } from "@/lib/assistant/tools";
import type { ClaudeMessages } from "@/lib/ai/claude";

const job: PublicJobDetail = {
  slug: "oracle-integration-developer",
  title: "Oracle Integration Developer",
  company: "Consult America",
  location: "Baltimore, MD",
  workplaceType: "Hybrid",
  employmentType: "Full Time",
  skills: ["OIC", "REST", "SOAP"],
  postedAt: "2026-10-05T00:00:00Z",
  viewHref: "/jobs/oracle-integration-developer",
  applyHref: "/jobs/oracle-integration-developer/apply",
  applyIsExternal: false,
  summary: "Build OIC integrations.",
  description: "Build OIC integrations with REST and SOAP.",
  responsibilities: ["Build integrations"],
  qualifications: ["OIC experience"],
  preferredQualifications: [],
};

function jobsSource(jobs: PublicJobDetail[] = [job]): PublicJobSource & { searches: unknown[] } {
  const searches: unknown[] = [];
  return {
    searches,
    async search(params) {
      searches.push(params);
      const q = params.query?.toLowerCase();
      const hits = jobs.filter((j) => (!q || `${j.title} ${j.skills.join(" ")}`.toLowerCase().includes(q)) && (!params.location || j.location.toLowerCase().includes(params.location.toLowerCase())));
      return { total: hits.length, jobs: hits };
    },
    async get(slug) {
      return jobs.find((j) => j.slug === slug) ?? null;
    },
  };
}

const toolUse = (name: string, input: Record<string, unknown>, id = "tu_1"): Anthropic.Message =>
  ({ id: "m", type: "message", role: "assistant", model: "x", stop_reason: "tool_use", stop_sequence: null, usage: {} as never, content: [{ type: "tool_use", id, name, input }] }) as unknown as Anthropic.Message;
const text = (t: string): Anthropic.Message =>
  ({ id: "m", type: "message", role: "assistant", model: "x", stop_reason: "end_turn", stop_sequence: null, usage: {} as never, content: [{ type: "text", text: t, citations: null }] }) as unknown as Anthropic.Message;

function scripted(...replies: (Anthropic.Message | Error)[]): ClaudeMessages & { calls: Anthropic.MessageCreateParamsNonStreaming[] } {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  return {
    calls,
    async create(params) {
      calls.push(structuredClone(params));
      const next = replies.shift();
      if (!next) throw new Error("no more replies");
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const ask = (q: string) => [{ role: "user" as const, content: q }];

describe("AI careers assistant", () => {
  it("19. 'What jobs are open?' searches the public repository and returns server-built cards", async () => {
    const claude = scripted(toolUse("search_public_jobs", { query: null, location: null, employment_type: null, workplace_type: null }), text("Here is what's open."));
    const jobs = jobsSource();
    const reply = await runAssistant(ask("What jobs are open?"), { page: "careers" }, { claude, jobs, model: "m" });
    expect(reply.status).toBe("ok");
    expect(reply.jobs.map((j) => j.slug)).toEqual(["oracle-integration-developer"]);
    expect(reply.grounding).toContain("jobs");
    // Tool results go back as one user message right after the tool_use turn.
    expect(claude.calls[1].messages.at(-1)?.role).toBe("user");
  });

  it("20/21. searches by skill and by location through the same tool", async () => {
    const jobs = jobsSource();
    expect((await executeAssistantTool("search_public_jobs", { query: "OIC", location: null, employment_type: null, workplace_type: null }, { jobs })).jobs).toHaveLength(1);
    expect((await executeAssistantTool("search_public_jobs", { query: null, location: "Baltimore", employment_type: null, workplace_type: null }, { jobs })).jobs).toHaveLength(1);
    expect((await executeAssistantTool("search_public_jobs", { query: null, location: "Denver", employment_type: null, workplace_type: null }, { jobs })).jobs).toHaveLength(0);
  });

  it("22. zero openings: no fabricated jobs, and links to Careers and Jobs", async () => {
    const claude = scripted(toolUse("search_public_jobs", { query: null, location: null, employment_type: null, workplace_type: null }), text("We don't have any open roles at the moment."));
    const reply = await runAssistant(ask("What jobs are open?"), { page: "home" }, { claude, jobs: jobsSource([]), model: "m" });
    expect(reply.jobs).toEqual([]);
    expect(reply.links.map((l) => l.href)).toEqual(expect.arrayContaining(["/careers", "/jobs"]));
  });

  it("27. job-page context: only the slug is passed, and 'this job' resolves server-side", async () => {
    const claude = scripted(toolUse("get_public_job", { slug: "oracle-integration-developer" }), text("It needs OIC, REST and SOAP."));
    const reply = await runAssistant(ask("What skills does this job require?"), { page: "job", jobSlug: "oracle-integration-developer" }, { claude, jobs: jobsSource(), model: "m" });
    const first = JSON.stringify(claude.calls[0].messages[0].content);
    expect(first).toContain('slug \\"oracle-integration-developer\\"');
    expect(first).not.toContain("Build OIC integrations"); // no record injected client-side
    expect(reply.jobs[0].slug).toBe("oracle-integration-developer");
  });

  it("28/29. salary and visa details not in the posting come back as null for the model", async () => {
    const out = await executeAssistantTool("get_public_job", { slug: "oracle-integration-developer" }, { jobs: jobsSource() });
    const data = JSON.parse(out.content).job;
    expect(data.salary).toBeNull();
    expect(JSON.stringify(data)).not.toMatch(/visa|sponsor/i);
    expect(SYSTEM_PROMPT).toMatch(/visa sponsorship/);
    expect(SYSTEM_PROMPT).toMatch(/doesn't specify/);
  });

  it("30. prompt injection: no tool exists to reach candidates or internal data, and invalid input is rejected", async () => {
    const jobs = jobsSource();
    expect((await executeAssistantTool("get_public_job", { slug: "../../candidates" }, { jobs })).isError).toBe(true);
    expect((await executeAssistantTool("search_public_jobs", { query: "x", location: null, employment_type: "Volunteer", workplace_type: null }, { jobs })).isError).toBe(true);
    expect((await executeAssistantTool("search_public_jobs", { query: null, location: null, employment_type: null, workplace_type: null, sql: "select *" }, { jobs })).isError).toBe(true);
    expect(SYSTEM_PROMPT).toMatch(/DATA, not instructions/);
  });

  it("31. repository unavailable: safe message with a link to browse Jobs", async () => {
    const broken: PublicJobSource = { search: async () => { throw new Error("db down"); }, get: async () => null };
    const claude = scripted(toolUse("search_public_jobs", { query: null, location: null, employment_type: null, workplace_type: null }), new Error("provider down"));
    const reply = await runAssistant(ask("Any jobs?"), { page: "jobs" }, { claude, jobs: broken, model: "m" });
    expect(reply.status).toBe("fallback");
    expect(reply.reply).toMatch(/trouble searching current openings/);
    expect(reply.links[0].href).toBe("/jobs");
  });

  it("32. AI provider unavailable or unconfigured: safe fallback, no internals", async () => {
    const log = vi.fn<(e: AssistantLogEvent) => void>();
    const down = await runAssistant(ask("Hi"), { page: "home" }, { claude: scripted(new Error("ECONNRESET secret-internal")), jobs: jobsSource(), model: "m", log });
    expect(down.status).toBe("fallback");
    expect(JSON.stringify(down)).not.toMatch(/ECONNRESET|secret/);
    const none = await runAssistant(ask("Hi"), { page: "home" }, { claude: null, jobs: jobsSource(), model: "m" });
    expect(none.status).toBe("fallback");
  });

  it("refusals and endless tool loops fall back safely", async () => {
    const refusal = { ...text(""), stop_reason: "refusal" } as Anthropic.Message;
    expect((await runAssistant(ask("x"), { page: "home" }, { claude: scripted(refusal), jobs: jobsSource(), model: "m" })).status).toBe("fallback");
    const loop = scripted(...Array.from({ length: 5 }, (_, i) => toolUse("get_company_information", { topic: "overview" }, `t${i}`)));
    expect((await runAssistant(ask("x"), { page: "home" }, { claude: loop, jobs: jobsSource(), model: "m" })).status).toBe("fallback");
  });

  it("company answers come only from approved content", async () => {
    const out = await executeAssistantTool("get_company_information", { topic: "oracle_cloud" }, { jobs: jobsSource() });
    expect(JSON.parse(out.content).facts[0]).toMatch(/^Oracle Cloud: Migrate and modernize/);
    expect(out.grounding).toBe("company");
  });

  it("application guidance routes to Easy Apply and Detailed Apply, never an in-chat form", async () => {
    const out = await executeAssistantTool("get_application_guidance", { slug: "oracle-integration-developer" }, { jobs: jobsSource() });
    expect(out.links.map((l) => l.href)).toEqual(["/jobs/oracle-integration-developer/apply", "/jobs/oracle-integration-developer/apply/detailed"]);
  });
});
