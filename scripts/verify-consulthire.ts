/**
 * Local end-to-end exercise of the ConsultHire integration.
 *
 * SAFE BY CONSTRUCTION: asserts `current_database() = 'ca_localdev'` before it
 * writes anything and aborts otherwise, because every step here mutates real
 * rows (a job's interview link, an application, an interview result) and none
 * of it may ever touch production.
 *
 * Usage, with ConsultHire running on 3100 and this app's dev server on 3000:
 *   npx tsx --env-file=.env.local scripts/verify-consulthire.ts <step>
 *
 * Steps:
 *   generate <slug>   generate the role interview, as the publish hook does
 *   apply <slug>      file an AI application and mint its launch URL
 *   webhook <appId>   post a correctly signed completion to the local receiver
 */

import { createHmac } from "node:crypto";

import { consultHireConfig } from "@/lib/consulthire/client";
import { generateRoleInterview } from "@/lib/consulthire/roles";
import { query } from "@/lib/neon/client";
import { getJobBySlug } from "@/lib/neon/jobs";

async function assertLocal(): Promise<void> {
  const [row] = await query<{ db: string }>("SELECT current_database() AS db");
  if (row?.db !== "ca_localdev") {
    throw new Error(`Refusing to run against "${row?.db}". Expected ca_localdev.`);
  }
  console.log(`database: ${row.db}`);
}

async function generate(slug: string): Promise<void> {
  const job = await getJobBySlug(slug);
  if (!job) throw new Error(`No job with slug ${slug}`);
  console.log(`job: ${job.reference} ${job.title} (status ${job.status})`);
  console.log(`before: consulthire_status=${job.consulthire_status}`);

  const started = Date.now();
  const result = await generateRoleInterview(job.id);
  console.log(`result (${Date.now() - started}ms):`, JSON.stringify(result));

  const after = await getJobBySlug(slug);
  console.log(
    `after:  consulthire_status=${after?.consulthire_status}`,
    `role_id=${after?.consulthire_role_id}`,
    `slug=${after?.consulthire_slug}`,
    `url=${after?.consulthire_url}`,
    `error=${after?.consulthire_error ?? "none"}`,
  );
}

async function apply(slug: string): Promise<void> {
  const config = consultHireConfig();
  if (!config) throw new Error("ConsultHire is not configured.");

  const { submitApplication } = await import("@/lib/neon/applications");
  const { launchUrl } = await import("@/lib/consulthire/client");

  const job = await getJobBySlug(slug);
  if (!job?.consulthire_slug) throw new Error(`${slug} has no READY interview.`);

  const email = `verify+${Date.now()}@example.com`;
  const filed = await submitApplication({
    jobId: job.id,
    candidate: { email, firstName: "Verify", lastName: "Candidate", phone: "703-555-0100" },
    source: "careers",
    method: "AI_INTERVIEW",
    withAiScreen: true,
  });

  console.log(`application: ${filed.application.id} ${filed.application.reference}`);
  console.log(`method:      ${filed.application.method}`);
  console.log(`interview:   ${filed.interview?.id} kind=${filed.interview?.kind} status=${filed.interview?.status}`);
  console.log(`launched_at: ${filed.interview?.launched_at?.toISOString()}`);

  const url = launchUrl(
    job.consulthire_slug,
    {
      appId: filed.application.id,
      interviewId: filed.interview!.id,
      name: "Verify Candidate",
      email,
      jobId: job.id,
    },
    config,
  );
  console.log(`launchUrl:   ${url}`);
  console.log(`APP_ID=${filed.application.id}`);
}

/** A realistic EvaluationReport, shaped like ConsultHire's scorer produces. */
function sampleReport() {
  return {
    version: 1,
    incomplete: false,
    recommendation: "Strong match",
    keySignal: "Deep Kubernetes and Terraform experience; cost tuning unproven.",
    confidence: "high",
    competenciesAssessed: 5,
    competenciesTotal: 5,
    mustHaveCovered: 4,
    mustHaveTotal: 4,
    breakdown: [
      { key: "technical_expertise", label: "Technical expertise", score: 9 },
      { key: "relevant_experience", label: "Relevant experience", score: 8.5 },
      { key: "problem_solving", label: "Problem solving", score: 8 },
      { key: "communication", label: "Communication", score: 9 },
      { key: "role_requirements", label: "Role requirements", score: null },
    ],
    strengths: [
      "Ran a multi-cluster Kubernetes migration end to end.",
      "Writes Terraform modules other teams reuse.",
    ],
    concerns: ["No direct experience of FinOps or cloud cost reduction targets."],
    evidence: [
      {
        point: "Owned the cluster upgrade path across three environments.",
        quote: "I wrote the upgrade runbook and ran it on staging twice before prod.",
      },
    ],
    perQuestion: [],
  };
}

async function webhook(applicationId: string): Promise<void> {
  const secret = process.env.CONSULTHIRE_WEBHOOK_SECRET || "";
  if (secret.length < 32) throw new Error("CONSULTHIRE_WEBHOOK_SECRET is not set.");

  const body = JSON.stringify({
    event: "interview.completed",
    interviewSessionId: `verify_session_${applicationId.slice(0, 8)}`,
    externalAppId: applicationId,
    score: 8.5,
    verdict: "Strong match",
    // Stringified, exactly as ConsultHire's partnerWebhook.ts sends it.
    report: JSON.stringify(sampleReport()),
    completedAt: new Date().toISOString(),
    transcriptUrl: null,
  });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const url = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/webhooks/consulthire`;

  const send = async (label: string, headers: Record<string, string>) => {
    const res = await fetch(url, { method: "POST", headers, body });
    console.log(`${label}: ${res.status} ${await res.text()}`);
  };

  await send("signed  ", {
    "content-type": "application/json",
    "x-consulthire-timestamp": timestamp,
    "x-consulthire-signature": signature,
  });

  // The same delivery again: must be a no-op that still answers 200.
  await send("replay  ", {
    "content-type": "application/json",
    "x-consulthire-timestamp": timestamp,
    "x-consulthire-signature": signature,
  });

  // One flipped character in the signature: must be 401.
  await send("forged  ", {
    "content-type": "application/json",
    "x-consulthire-timestamp": timestamp,
    "x-consulthire-signature": signature.replace(/.$/, (c) => (c === "a" ? "b" : "a")),
  });
}

async function main(): Promise<void> {
  await assertLocal();
  const [step, arg] = process.argv.slice(2);
  switch (step) {
    case "generate":
      return generate(arg!);
    case "apply":
      return apply(arg!);
    case "webhook":
      return webhook(arg!);
    default:
      throw new Error("Usage: verify-consulthire.ts generate|apply|webhook <arg>");
  }
}

// Not top-level await: tsx transforms this file to CJS, which does not support
// it. The catch is what makes a failure a non-zero exit instead of an
// unhandled rejection warning.
main().catch((error: unknown) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
