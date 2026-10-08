import { getSupabaseServiceClient, isSupabaseConfigured } from "@/app/lib/supabase/server";

/**
 * Provisions a Candidate Portal sign-in for a newly-submitted application:
 * invites the candidate's email via Supabase Auth (sends them a "set your
 * password" email) and links the resulting auth user to a `profiles` row
 * (profiles.id -> candidate_profiles.profile_id) with the CANDIDATE role, so
 * `getAuthenticatedPlatformUser()` resolves them once they finish the invite.
 *
 * No-ops when Supabase isn't configured (demo mode uses DEMO_CANDIDATE_SESSION
 * instead — see lib/candidate/session.ts). Never throws: provisioning the
 * portal account must never block the underlying application submission.
 *
 * Returns "email-exists" when Supabase Auth already has a sign-in for the
 * address (nothing is bound then — see the claim flow in
 * lib/candidate-portal/activation.ts), "linked" when the record already has
 * a portal profile.
 */
export async function provisionCandidatePortalAccount(input: {
  candidateId: string;
  email: string;
  displayName: string;
}): Promise<"sent" | "linked" | "email-exists" | "failed" | "disabled"> {
  if (!isSupabaseConfigured()) return "disabled";

  const client = getSupabaseServiceClient();
  if (!client) return "disabled";

  // Ids and codes only — never the applicant's email address.
  const fail = (event: string, code: unknown) => {
    console.error("[candidate-provisioning]", { event, candidateId: input.candidateId, code: code ?? null });
    return "failed" as const;
  };

  try {
    const { data: existingCandidate, error: lookupError } = await client
      .from("candidate_profiles")
      .select("profile_id")
      .eq("id", input.candidateId)
      .maybeSingle();
    if (lookupError) return fail("candidate-lookup-failed", lookupError.code);
    if (existingCandidate?.profile_id) return "linked";

    const now = new Date().toISOString();
    const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
    const { data: invited, error: inviteError } =
      await client.auth.admin.inviteUserByEmail(
        input.email,
        site ? { redirectTo: `${site}/candidate/activate` } : undefined,
      );
    if (inviteError?.code === "email_exists") {
      console.info("[candidate-provisioning]", { event: "invite-skipped-email-exists", candidateId: input.candidateId });
      return "email-exists";
    }
    if (inviteError || !invited?.user) return fail("invite-failed", inviteError?.code ?? inviteError?.status);

    // Idempotent: a concurrent submission may have created the same profile.
    const profileId = `profile-${input.candidateId}`;
    const { error: profileError } = await client.from("profiles").insert({
      id: profileId,
      email: input.email,
      display_name: input.displayName,
      status: "INVITED",
      auth_user_id: invited.user.id,
      created_at: now,
      updated_at: now,
    });
    if (profileError && profileError.code !== "23505") return fail("profile-insert-failed", profileError.code);

    // Bind only a still-unlinked record: never re-point an existing link.
    const { error: bindError } = await client
      .from("candidate_profiles")
      .update({ profile_id: profileId, updated_at: now })
      .eq("id", input.candidateId)
      .is("profile_id", null);
    if (bindError) return fail("candidate-bind-failed", bindError.code);

    const { error: roleError } = await client.from("user_roles").insert({
      id: `${profileId}-candidate`,
      user_id: profileId,
      role: "CANDIDATE",
    });
    if (roleError && roleError.code !== "23505") return fail("role-insert-failed", roleError.code);
    return "sent";
  } catch (error) {
    return fail("provisioning-threw", error instanceof Error ? error.message : "unknown");
  }
}

/**
 * Creates a brand-new candidate account for self-service signup (/signup) —
 * no prior job application required. Unlike provisionCandidatePortalAccount
 * (which links an existing candidate_profiles row created by an application
 * to a new profile), this creates the candidate_profiles row too, since the
 * person hasn't applied to anything yet.
 *
 * Called after `supabase.auth.signUp()` succeeds, with the resulting auth
 * user id. Throws on failure — unlike the invite flow above, a failure here
 * must surface to the signup form rather than fail silently, since there's
 * no application submission to fall back on.
 */
export async function createCandidateAccount(input: {
  authUserId: string;
  email: string;
  firstName: string;
  lastName: string;
}): Promise<{ candidateId: string; profileId: string }> {
  const client = getSupabaseServiceClient();
  if (!client) throw new Error("Supabase is not configured");

  const now = new Date().toISOString();
  const candidateId = `cand-${crypto.randomUUID()}`;
  const profileId = `profile-${crypto.randomUUID()}`;

  // profiles must exist before candidate_profiles.profile_id FK.
  const { error: profileError } = await client.from("profiles").insert({
    id: profileId,
    email: input.email,
    display_name: `${input.firstName} ${input.lastName}`.trim(),
    status: "ACTIVE",
    auth_user_id: input.authUserId,
    created_at: now,
    updated_at: now,
  });
  if (profileError) {
    throw new Error(`Failed to create profile: ${profileError.message}`);
  }

  const { error: candidateError } = await client.from("candidate_profiles").insert({
    id: candidateId,
    profile_id: profileId,
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    source: "Self-Signup",
    created_at: now,
    updated_at: now,
  });
  if (candidateError) {
    // Roll back the profile so a retry can succeed cleanly.
    await client.from("profiles").delete().eq("id", profileId);
    throw new Error(`Failed to create candidate profile: ${candidateError.message}`);
  }

  const { error: roleError } = await client.from("user_roles").insert({
    id: `${profileId}-candidate`,
    user_id: profileId,
    role: "CANDIDATE",
  });
  if (roleError) {
    await client.from("candidate_profiles").delete().eq("id", candidateId);
    await client.from("profiles").delete().eq("id", profileId);
    throw new Error(`Failed to grant candidate role: ${roleError.message}`);
  }

  return { candidateId, profileId };
}
