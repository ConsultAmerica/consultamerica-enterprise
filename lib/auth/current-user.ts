import "server-only";

import { cache } from "react";

import { isSupabaseBrowserConfigured } from "@/app/lib/supabase/client";
import { getSupabaseServerAuthClient } from "@/app/lib/supabase/auth-server";
import { getSupabaseServiceClient } from "@/app/lib/supabase/server";

/** Platform roles (shared with consultamerica-functional-source types/identity.ts). */
export type PlatformRole =
  | "SYSTEM_ADMIN"
  | "HR_ADMIN"
  | "HR_SPECIALIST"
  | "RECRUITER"
  | "HIRING_MANAGER"
  | "PAYROLL_ADMIN"
  | "MANAGER"
  | "EMPLOYEE"
  | "CANDIDATE"
  | "SALES_REP"
  | "SALES_MANAGER";

export type AuthenticatedPlatformUser = {
  userId: string;
  authUserId: string;
  email: string;
  displayName: string;
  roles: PlatformRole[];
};

/**
 * Resolves the Supabase Auth session to a `profiles` row plus `user_roles`.
 * Same identity model as functional-source lib/auth/current-user.ts — one
 * shared auth system, not a parallel one. Returns null without a session.
 */
export const getAuthenticatedPlatformUser = cache(async (): Promise<AuthenticatedPlatformUser | null> => {
  if (!isSupabaseBrowserConfigured()) return null;
  const authClient = await getSupabaseServerAuthClient();
  if (!authClient) return null;

  const {
    data: { user: authUser },
  } = await authClient.auth.getUser();
  if (!authUser) return null;

  const service = getSupabaseServiceClient();
  if (!service) return null;

  const { data: profile } = await service
    .from("profiles")
    .select("id, email, display_name")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();
  if (!profile) return null;

  const { data: roleRows } = await service.from("user_roles").select("role").eq("user_id", profile.id);

  return {
    userId: profile.id as string,
    authUserId: authUser.id,
    email: profile.email as string,
    displayName: profile.display_name as string,
    roles: (roleRows ?? []).map((r) => r.role as PlatformRole),
  };
});
