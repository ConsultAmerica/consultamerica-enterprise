import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { getSupabaseServerAuthClient } from "@/app/lib/supabase/auth-server";
import { provisionCandidatePortalAccount } from "@/lib/candidate/provisioning";
import {
  hasFreshEmailProof,
  type AccessRequestPorts,
  type ActivationPorts,
  type AuthIdentity,
} from "@/lib/candidate-portal/activation";

/** Public origin used in emailed links (NEXT_PUBLIC_SITE_URL, else NEXT_PUBLIC_APP_URL). */
export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** Where emailed links land when the Supabase template still uses the default ConfirmationURL. */
export function activationRedirectUrl(): string {
  return `${siteOrigin()}/candidate/activate`;
}

type AuthClient = NonNullable<Awaited<ReturnType<typeof getSupabaseServerAuthClient>>>;

/**
 * The signed-in identity, from the Auth server (getUser) plus the verified
 * JWT's `amr` (getClaims) for how recently the inbox was proven. Never from
 * client input.
 */
export async function currentActivationIdentity(auth: AuthClient): Promise<AuthIdentity | null> {
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;
  const { data: claims } = await auth.auth.getClaims();
  const verified = claims?.claims?.sub === user.id ? claims.claims : null;
  return {
    authUserId: user.id,
    email: user.email ?? null,
    emailConfirmed: Boolean(user.email_confirmed_at),
    freshEmailProof: hasFreshEmailProof(verified?.amr, Math.floor(Date.now() / 1000)),
  };
}

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

export function createActivationPorts(service: SupabaseClient): ActivationPorts {
  return {
    async findProfileByAuthUser(authUserId) {
      const { data } = await service.from("profiles").select("id, status").eq("auth_user_id", authUserId).maybeSingle();
      return data ? { profileId: data.id as string, status: (data.status as string | null) ?? null } : null;
    },
    async hasCandidateRole(profileId) {
      const { data } = await service.from("user_roles").select("role").eq("user_id", profileId).eq("role", "CANDIDATE").limit(1);
      return (data ?? []).length > 0;
    },
    async findCandidateByProfile(profileId) {
      const { data } = await service
        .from("candidate_profiles")
        .select("id")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: true })
        .limit(1);
      return data?.[0] ? { candidateId: data[0].id as string } : null;
    },
    async listRoles(profileId) {
      const { data, error } = await service.from("user_roles").select("role").eq("user_id", profileId);
      if (error) throw new Error(`role lookup failed (${error.code})`);
      return (data ?? []).map((r) => r.role as string);
    },
    async findUnlinkedCandidatesByEmail(email) {
      const { data, error } = await service
        .from("candidate_profiles")
        .select("id")
        .ilike("email", escapeLike(email))
        .is("profile_id", null)
        .limit(5);
      if (error) throw new Error(`candidate lookup failed (${error.code})`);
      return (data ?? []).map((r) => ({ candidateId: r.id as string }));
    },
  };
}

/**
 * Binds a still-unlinked candidate record to a verified sign-in (the claim
 * step; the caller has already re-run resolveActivation and got "claimable").
 * The candidate update is conditional on profile_id IS NULL, so a race or a
 * replay can never re-point a record that is already someone's.
 */
export async function bindClaimedCandidate(
  service: SupabaseClient,
  input: { candidateId: string; profileId: string | null; authUserId: string; email: string; displayName: string },
): Promise<{ ok: true; profileId: string } | { ok: false }> {
  const now = new Date().toISOString();
  let profileId = input.profileId;
  if (!profileId) {
    profileId = `profile-${input.candidateId}`;
    const { error } = await service.from("profiles").insert({
      id: profileId,
      email: input.email,
      display_name: input.displayName || input.email,
      status: "INVITED",
      auth_user_id: input.authUserId,
      created_at: now,
      updated_at: now,
    });
    if (error) {
      console.error("[candidate-claim]", { event: "profile-insert-failed", code: error.code ?? null });
      return { ok: false };
    }
  }
  const { data: bound, error: bindError } = await service
    .from("candidate_profiles")
    .update({ profile_id: profileId, updated_at: now })
    .eq("id", input.candidateId)
    .is("profile_id", null)
    .select("id");
  if (bindError || (bound ?? []).length !== 1) {
    console.error("[candidate-claim]", { event: "bind-failed", code: bindError?.code ?? "already-linked" });
    if (!input.profileId) await service.from("profiles").delete().eq("id", profileId).eq("auth_user_id", input.authUserId);
    return { ok: false };
  }
  const { error: roleError } = await service
    .from("user_roles")
    .insert({ id: `${profileId}-candidate`, user_id: profileId, role: "CANDIDATE" });
  if (roleError && roleError.code !== "23505") {
    console.error("[candidate-claim]", { event: "role-insert-failed", code: roleError.code ?? null });
    return { ok: false };
  }
  return { ok: true, profileId };
}

export function createAccessRequestPorts(service: SupabaseClient): AccessRequestPorts {
  const redirectTo = activationRedirectUrl();
  return {
    async findCandidatesByEmail(email) {
      const { data, error } = await service
        .from("candidate_profiles")
        .select("id, profile_id, first_name, last_name")
        .ilike("email", escapeLike(email))
        .order("created_at", { ascending: true })
        .limit(5);
      if (error) throw new Error(`candidate lookup failed (${error.code})`);
      return (data ?? []).map((r) => ({
        candidateId: r.id as string,
        profileId: (r.profile_id as string | null) ?? null,
        displayName: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
      }));
    },
    async findAuthUserForProfile(profileId) {
      const { data } = await service.from("profiles").select("auth_user_id").eq("id", profileId).maybeSingle();
      const authUserId = (data?.auth_user_id as string | null) ?? null;
      if (!authUserId) return null;
      const { data: user } = await service.auth.admin.getUserById(authUserId);
      if (!user?.user) return null;
      return { authUserId, emailConfirmed: Boolean(user.user.email_confirmed_at) };
    },
    async invite(input) {
      const outcome = await provisionCandidatePortalAccount(input);
      return outcome === "email-exists" ? "email-exists" : outcome === "failed" ? "failed" : "sent";
    },
    async reinvite({ profileId, email }) {
      const { data, error } = await service.auth.admin.inviteUserByEmail(email, { redirectTo });
      if (error || !data?.user) throw new Error(`re-invite failed (${error?.code ?? error?.status ?? "unknown"})`);
      // Bind the (possibly new) invited auth user to the existing profile — the
      // only party who can use it is whoever opens the link sent to this inbox.
      const { error: bindError } = await service
        .from("profiles")
        .update({ auth_user_id: data.user.id, updated_at: new Date().toISOString() })
        .eq("id", profileId);
      if (bindError) throw new Error(`profile bind failed (${bindError.code})`);
    },
    async sendSignInLink(email) {
      // Anon-key client: this is the public OTP endpoint, rate limited by Supabase Auth.
      const { createClient } = await import("@supabase/supabase-js");
      const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
      if (error) throw new Error(`sign-in link failed (${error.code ?? error.status ?? "unknown"})`);
    },
  };
}
