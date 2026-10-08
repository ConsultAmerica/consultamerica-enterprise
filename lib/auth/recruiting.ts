import "server-only";

import { redirect } from "next/navigation";

import { assertDemoSessionAllowed, isSupabaseBrowserConfigured } from "@/app/lib/supabase/client";
import { getAuthenticatedPlatformUser, type PlatformRole } from "@/lib/auth/current-user";

/**
 * Recruiting-staff authorization for the workspace (/app/recruiting/*),
 * mirroring SQL is_recruiting_staff(): RECRUITER, HR_ADMIN, HR_SPECIALIST,
 * SYSTEM_ADMIN. Hiring managers are intentionally excluded from candidate
 * search, job intake and matching (least privilege) until per-requisition
 * scoping exists.
 */
export const RECRUITING_STAFF_ROLES: readonly PlatformRole[] = ["RECRUITER", "HR_ADMIN", "HR_SPECIALIST", "SYSTEM_ADMIN"];

export type RecruitingActor = {
  profileId: string | null;
  displayName: string;
  email: string;
  roles: PlatformRole[];
  /** True only for local development without Supabase (never in production). */
  demo: boolean;
};

export const DEMO_RECRUITING_ACTOR: RecruitingActor = {
  profileId: null,
  displayName: "Demo Recruiter",
  email: "demo.recruiter@example.test",
  roles: ["RECRUITER"],
  demo: true,
};

export function isRecruitingStaff(roles: readonly string[]): boolean {
  return roles.some((role) => (RECRUITING_STAFF_ROLES as readonly string[]).includes(role));
}

export class RecruitingAuthorizationError extends Error {
  constructor() {
    super("You are not authorized to perform this action.");
    this.name = "RecruitingAuthorizationError";
  }
}

/** Returns the actor or null (no session / not recruiting staff). */
export async function getRecruitingActor(): Promise<RecruitingActor | null> {
  if (!isSupabaseBrowserConfigured()) {
    // Same rule as functional-source guardUnconfiguredSession: demo only outside production.
    assertDemoSessionAllowed("recruiting workspace");
    return DEMO_RECRUITING_ACTOR;
  }
  const user = await getAuthenticatedPlatformUser();
  if (!user || !isRecruitingStaff(user.roles)) return null;
  return { profileId: user.userId, displayName: user.displayName, email: user.email, roles: user.roles, demo: false };
}

/** For pages/layouts: redirects to /login when not signed in as recruiting staff. */
export async function requireRecruitingStaff(returnTo = "/app/recruiting"): Promise<RecruitingActor> {
  const actor = await getRecruitingActor();
  if (actor) return actor;
  const user = isSupabaseBrowserConfigured() ? await getAuthenticatedPlatformUser() : null;
  redirect(user ? "/login?error=forbidden" : `/login?returnTo=${encodeURIComponent(returnTo)}`);
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function assertRecruitingStaff(): Promise<RecruitingActor> {
  const actor = await getRecruitingActor();
  if (!actor) throw new RecruitingAuthorizationError();
  return actor;
}
