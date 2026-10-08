import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isExplicitDemoMode } from "@/app/lib/supabase/client";
import { getSupabaseServiceClient } from "@/app/lib/supabase/server";
import { getAuthenticatedPlatformUser } from "@/lib/auth/current-user";
import type { CandidateSession } from "@/lib/candidate-portal/types";

/**
 * Candidate identity for the portal and signed-in Detailed Apply.
 *
 * Access requires a Supabase Auth session whose profile holds the CANDIDATE
 * role AND is linked to a candidate_profiles row (profile_id). That link is
 * created only through verified ownership — the Easy Apply invite email
 * (lib/candidate/provisioning.ts) — never by matching an email string, so an
 * account can never see applications merely because its email matches.
 */

export const DEMO_CANDIDATE_COOKIE = "ca_demo_candidate";

/** Two local identities so cross-candidate access can be exercised without Supabase. */
export const DEMO_CANDIDATES: Record<"a" | "b", CandidateSession> = {
  a: { candidateId: "cand-demo-a", profileId: null, email: "alex.demo@example.test", displayName: "Alex Demo", demo: true },
  b: { candidateId: "cand-demo-b", profileId: null, email: "blake.demo@example.test", displayName: "Blake Demo", demo: true },
};

export class CandidateAuthorizationError extends Error {
  constructor() {
    super("Please sign in to your candidate account to continue.");
    this.name = "CandidateAuthorizationError";
  }
}

/** The signed-in candidate, or null (anonymous, staff-only account, or unlinked profile). Never throws. */
export async function getCandidateSession(): Promise<CandidateSession | null> {
  const jar = await cookies();
  if (isExplicitDemoMode()) {
    const key = jar.get(DEMO_CANDIDATE_COOKIE)?.value;
    return key === "a" || key === "b" ? DEMO_CANDIDATES[key] : null;
  }

  // Public pages (job detail, Detailed Apply) call this for every visitor:
  // skip the Supabase round trip when there is no auth cookie at all.
  if (!jar.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"))) return null;

  const user = await getAuthenticatedPlatformUser().catch(() => null);
  if (!user || !user.roles.includes("CANDIDATE")) return null;

  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client
    .from("candidate_profiles")
    .select("id, first_name, last_name, email")
    .eq("profile_id", user.userId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error || !data?.[0]) return null;
  const row = data[0];
  return {
    candidateId: row.id as string,
    profileId: user.userId,
    email: (row.email as string) || user.email,
    displayName: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || user.displayName,
    demo: false,
  };
}

/** For portal pages: redirects to the candidate sign-in when there is no candidate session. */
export async function requireCandidate(returnTo = "/candidate"): Promise<CandidateSession> {
  const session = await getCandidateSession();
  if (session) return session;
  redirect(`/candidate/login?returnTo=${encodeURIComponent(returnTo)}`);
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function assertCandidate(): Promise<CandidateSession> {
  const session = await getCandidateSession();
  if (!session) throw new CandidateAuthorizationError();
  return session;
}
