import { z } from "zod";

import { ASSISTANT_MODEL, claudeMessages, getClaudeClient } from "@/lib/ai/claude";
import { runAssistant, type AssistantReply } from "@/lib/assistant/engine";
import { publicJobSource } from "@/lib/assistant/public-jobs";
import { checkAssistantRateLimit, clientIp } from "@/lib/assistant/rate-limit";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

const turn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1000),
});

const body = z.object({
  messages: z
    .array(turn)
    .min(1)
    .max(12)
    .refine((m) => m[0]?.role === "user" && m[m.length - 1]?.role === "user", "must start and end with a user turn"),
  context: z.discriminatedUnion("page", [
    z.object({ page: z.enum(["home", "about", "careers", "jobs"]) }),
    z.object({ page: z.literal("job"), jobSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,199}$/) }),
  ]),
});

function json(data: AssistantReply | { status: "limited" | "invalid"; reply: string; links: AssistantReply["links"] }, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

const log = (event: Record<string, unknown>) => console.info("[ai-careers]", event);

function sameHost(origin: string, host: string | null): boolean {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  // Browsers send Origin on cross-site requests; only this site may call the endpoint.
  const origin = request.headers.get("origin");
  if (origin && !sameHost(origin, request.headers.get("host"))) {
    return json({ status: "invalid", reply: "Request not allowed.", links: [] }, 403);
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return json({ status: "invalid", reply: "That message is too long.", links: [] }, 413);
  }

  let parsed: z.infer<typeof body>;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) throw new Error("too large");
    parsed = body.parse(JSON.parse(raw));
  } catch {
    return json({ status: "invalid", reply: "I couldn't read that message. Please try again.", links: [] }, 400);
  }

  const decision = await checkAssistantRateLimit(clientIp(request.headers));
  if (!decision.allowed) {
    log({ event: "rate-limited", reason: decision.reason });
    if (decision.reason === "store-unavailable") {
      return json(
        { status: "fallback", reply: "The assistant is temporarily unavailable. You can browse current openings on the Jobs page.", jobs: [], links: [{ label: "Browse Jobs", href: "/jobs" }], grounding: [] },
        503,
      );
    }
    return json(
      {
        status: "limited",
        reply: "You've sent a lot of questions in a short time. Please try again in a few minutes — or browse Jobs directly.",
        links: [{ label: "Browse Jobs", href: "/jobs" }],
      },
      429,
    );
  }

  try {
    const client = getClaudeClient();
    const reply = await runAssistant(parsed.messages, parsed.context, {
      claude: client ? claudeMessages(client) : null,
      jobs: publicJobSource,
      model: ASSISTANT_MODEL,
      log,
    });
    return json(reply);
  } catch (error) {
    log({ event: "unexpected-failure", error: error instanceof Error ? error.name : "unknown" });
    return json({
      status: "fallback",
      reply: "I can't answer right now. You can browse current openings on the Jobs page.",
      jobs: [],
      links: [{ label: "View Jobs", href: "/jobs" }],
      grounding: [],
    });
  }
}
