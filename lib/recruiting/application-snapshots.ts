import "server-only";

import { getSupabaseServiceClient } from "@/app/lib/supabase/server";
import { detailedProfileSchema, type DetailedProfile } from "@/lib/recruiting/detailed-profile";

/**
 * Detailed Apply profile snapshots (db/schema/045 application_profile_snapshots).
 * The candidate-reviewed profile is stored per application rather than merged
 * into canonical candidate rows, so an unauthenticated submission can never
 * rewrite an existing candidate's profile.
 */

export { detailedProfileSchema, type DetailedProfile };

export type ApplicationSnapshot = {
  applicationId: string;
  candidateId: string;
  profile: DetailedProfile;
  answers: { question: string; answer: string }[];
  createdAt: string;
};

const memory = new Map<string, ApplicationSnapshot>();
const isMissingRelation = (code: string | undefined) => code === "PGRST205" || code === "42P01";

export async function saveApplicationSnapshot(snapshot: Omit<ApplicationSnapshot, "createdAt">): Promise<void> {
  const client = getSupabaseServiceClient();
  const createdAt = new Date().toISOString();
  if (!client) {
    memory.set(snapshot.applicationId, { ...snapshot, createdAt });
    return;
  }
  const { error } = await client.from("application_profile_snapshots").upsert(
    {
      id: `aps-${snapshot.applicationId}`,
      application_id: snapshot.applicationId,
      candidate_id: snapshot.candidateId,
      source: "DETAILED_APPLY",
      profile: snapshot.profile,
      answers: snapshot.answers,
      created_at: createdAt,
    },
    { onConflict: "application_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`application snapshot save failed (${error.code})`);
}

export async function getApplicationSnapshot(applicationId: string): Promise<ApplicationSnapshot | null> {
  const client = getSupabaseServiceClient();
  if (!client) return memory.get(applicationId) ?? null;
  const { data, error } = await client.from("application_profile_snapshots").select("*").eq("application_id", applicationId).maybeSingle();
  if (error) {
    if (isMissingRelation(error.code)) return null;
    throw new Error(`application snapshot read failed (${error.code})`);
  }
  if (!data) return null;
  return {
    applicationId: data.application_id as string,
    candidateId: data.candidate_id as string,
    profile: detailedProfileSchema.parse(data.profile),
    answers: (data.answers as ApplicationSnapshot["answers"]) ?? [],
    createdAt: data.created_at as string,
  };
}
