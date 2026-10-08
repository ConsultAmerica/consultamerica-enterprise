import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { provisionCandidatePortalAccount } from "@/lib/candidate/provisioning";
import type { AccessRequestPorts, ActivationPorts } from "@/lib/candidate-portal/activation";

/** Public origin used in emailed links (NEXT_PUBLIC_SITE_URL, else NEXT_PUBLIC_APP_URL). */
export function siteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** Where emailed links land when the Supabase template still uses the default ConfirmationURL. */
export function activationRedirectUrl(): string {
  return `${siteOrigin()}/candidate/activate`;
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
  };
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
      await provisionCandidatePortalAccount(input);
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
