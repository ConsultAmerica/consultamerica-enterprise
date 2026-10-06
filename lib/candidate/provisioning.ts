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
 */
export async function provisionCandidatePortalAccount(input: {
  candidateId: string;
  email: string;
  displayName: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const client = getSupabaseServiceClient();
  if (!client) return;

  try {
    const { data: existingCandidate } = await client
      .from("candidate_profiles")
      .select("profile_id")
      .eq("id", input.candidateId)
      .maybeSingle();
    if (existingCandidate?.profile_id) return;

    const now = new Date().toISOString();
    const { data: invited, error: inviteError } =
      await client.auth.admin.inviteUserByEmail(input.email);
    if (inviteError || !invited?.user) {
      console.error(
        `Candidate portal invite failed for ${input.email}: ${inviteError?.message}`,
      );
      return;
    }

    const profileId = `profile-${input.candidateId}`;
    await client.from("profiles").insert({
      id: profileId,
      email: input.email,
      display_name: input.displayName,
      status: "INVITED",
      auth_user_id: invited.user.id,
      created_at: now,
      updated_at: now,
    });

    await client
      .from("candidate_profiles")
      .update({ profile_id: profileId, updated_at: now })
      .eq("id", input.candidateId);

    await client.from("user_roles").insert({
      id: `${profileId}-candidate`,
      user_id: profileId,
      role: "CANDIDATE",
    });
  } catch (error) {
    console.error("Candidate portal provisioning failed:", error);
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
