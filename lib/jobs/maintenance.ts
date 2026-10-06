import { getSupabaseServiceClient } from "@/app/lib/supabase/server";

import { planJobMaintenance, type PublicationFields } from "@/lib/jobs/eligibility";

export type JobMaintenanceSummary = {
  ranAt: string;
  published: number;
  expired: number;
  stillActive: number;
  errors: string | null;
};

type MaintenanceRow = PublicationFields & { id: string; featured?: boolean };

export async function runJobMaintenance(now: Date = new Date()): Promise<JobMaintenanceSummary> {
  const client = getSupabaseServiceClient();
  const ranAt = now.toISOString();
  if (!client) {
    return { ranAt, published: 0, expired: 0, stillActive: 0, errors: "Supabase is not configured" };
  }

  const { data, error } = await client
    .from("jobs")
    .select("id,status,publish_at,published_at,expires_at,application_deadline,featured,is_demo")
    .in("status", ["SCHEDULED", "PUBLISHED", "OPEN"]);

  if (error) {
    return { ranAt, published: 0, expired: 0, stillActive: 0, errors: error.message };
  }

  const rows: MaintenanceRow[] = (data ?? []).map((row) => ({
    id: row.id as string,
    status: row.status as string,
    publishAt: (row.publish_at as string) ?? null,
    publishedAt: (row.published_at as string) ?? null,
    expiresAt: (row.expires_at as string) ?? null,
    applicationDeadline: (row.application_deadline as string) ?? null,
  }));

  const plan = planJobMaintenance(rows, now);
  let published = 0;
  let expired = 0;
  let errors: string | null = null;

  if (plan.publishIds.length > 0) {
    const { error: publishError, count } = await client
      .from("jobs")
      .update({
        status: "OPEN",
        published_at: ranAt,
        updated_at: ranAt,
      }, { count: "exact" })
      .in("id", plan.publishIds)
      .eq("status", "SCHEDULED");
    if (publishError) errors = publishError.message;
    else published = count ?? plan.publishIds.length;
  }

  if (plan.expireIds.length > 0) {
    const { error: expireError, count } = await client
      .from("jobs")
      .update({
        status: "EXPIRED",
        featured: false,
        closed_at: ranAt,
        updated_at: ranAt,
      }, { count: "exact" })
      .in("id", plan.expireIds)
      .in("status", ["PUBLISHED", "OPEN"]);
    if (expireError) errors = errors ? `${errors}; ${expireError.message}` : expireError.message;
    else expired = count ?? plan.expireIds.length;
  }

  const stillActive = rows.filter((row) => row.status === "PUBLISHED" || row.status === "OPEN").length - expired;

  await client.from("job_maintenance_runs").insert({
    id: `job-maint-${now.getTime()}`,
    ran_at: ranAt,
    published_count: published,
    expired_count: expired,
    still_active: Math.max(stillActive, 0),
    errors,
    summary: { publishIds: plan.publishIds, expireIds: plan.expireIds },
  });

  return {
    ranAt,
    published,
    expired,
    stillActive: Math.max(stillActive, 0),
    errors,
  };
}
