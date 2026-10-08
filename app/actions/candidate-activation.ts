"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isExplicitDemoMode } from "@/app/lib/supabase/client";
import { getSupabaseServerAuthClient } from "@/app/lib/supabase/auth-server";
import { getSupabaseServiceClient } from "@/app/lib/supabase/server";
import { checkPublicRateLimit, clientIp } from "@/lib/assistant/rate-limit";
import {
  ACCESS_REQUEST_MESSAGE,
  normalizeEmail,
  requestCandidateAccess,
  resolveActivation,
  validateNewPassword,
} from "@/lib/candidate-portal/activation";
import {
  bindClaimedCandidate,
  createAccessRequestPorts,
  createActivationPorts,
  currentActivationIdentity,
} from "@/lib/candidate-portal/activation-supabase";

export type ActivationFormState = { error: string | null };
export type AccessRequestState = { message: string | null; error: string | null };
export type ClaimState = { error: string | null };

const UNAVAILABLE = "Account activation isn't available right now. Please try again later.";

/**
 * Sets the candidate's password after Supabase Auth verified their emailed
 * link (the session exists only because /auth/confirm accepted the token).
 * The authenticated auth user must be the one the server bound to a
 * candidate record when it sent the invitation — no email matching.
 */
export async function activateCandidateAccount(_prev: ActivationFormState, formData: FormData): Promise<ActivationFormState> {
  const auth = await getSupabaseServerAuthClient();
  const service = getSupabaseServiceClient();
  if (!auth || !service) return { error: UNAVAILABLE };

  const identity = await currentActivationIdentity(auth);
  if (!identity) return { error: "Your activation link has expired. Request a new one below." };
  const user = { id: identity.authUserId, email: identity.email };

  const state = await resolveActivation(identity, createActivationPorts(service));
  if (state.kind !== "ready") return { error: "This sign-in isn't connected to a candidate account." };

  const password = String(formData.get("password") ?? "");
  const problem = validateNewPassword(password, String(formData.get("confirm") ?? ""), user.email ?? null);
  if (problem) return { error: problem };

  const { error } = await auth.auth.updateUser({ password });
  if (error) {
    const weak = error.code === "weak_password" || /password/i.test(error.message);
    console.error("[candidate-activation]", { event: "password-update-failed", code: error.code ?? null });
    return { error: weak ? "Please choose a stronger password." : UNAVAILABLE };
  }

  const { error: statusError } = await service
    .from("profiles")
    .update({ status: "ACTIVE", updated_at: new Date().toISOString() })
    .eq("id", state.profileId)
    .eq("auth_user_id", user.id);
  if (statusError) console.error("[candidate-activation]", { event: "status-update-failed", code: statusError.code ?? null });

  redirect("/candidate");
}

/**
 * "Email me a link": first-time claim, resend of an unaccepted invitation, or
 * a sign-in link for an activated account. Same response for every email.
 * Rate limited per client IP and per address.
 */
export async function requestCandidateAccessLink(_prev: AccessRequestState, formData: FormData): Promise<AccessRequestState> {
  if (isExplicitDemoMode()) return { message: null, error: "Account activation requires the connected environment." };
  const service = getSupabaseServiceClient();
  if (!service) return { message: null, error: UNAVAILABLE };

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email) return { message: null, error: "Please enter a valid email address." };

  const ip = clientIp(await headers());
  const [byIp, byEmail] = await Promise.all([
    checkPublicRateLimit("candidate-access", ip),
    checkPublicRateLimit("candidate-access-email", email),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    return { message: null, error: "Too many requests. Please wait a while before asking for another link." };
  }

  try {
    const decision = await requestCandidateAccess(email, createAccessRequestPorts(service));
    console.info("[candidate-access]", { event: "link-requested", decision });
  } catch (error) {
    // Logged without the address; the requester still gets the uniform reply.
    console.error("[candidate-access]", { event: "link-failed", error: error instanceof Error ? error.message : "unknown" });
  }
  return { message: ACCESS_REQUEST_MESSAGE, error: null };
}

/**
 * Verified claim: binds the unlinked applicant record filed under this
 * sign-in's verified address. Every condition is re-checked here (fresh
 * emailed-link proof, still unlinked, single match, no staff role) — the
 * page that rendered the button is not trusted.
 */
export async function claimCandidateRecord(_prev: ClaimState, formData: FormData): Promise<ClaimState> {
  void formData;
  const auth = await getSupabaseServerAuthClient();
  const service = getSupabaseServiceClient();
  if (!auth || !service) return { error: UNAVAILABLE };

  const identity = await currentActivationIdentity(auth);
  if (!identity) return { error: "Your sign-in has expired. Request a new link below." };

  const state = await resolveActivation(identity, createActivationPorts(service));
  if (state.kind === "claim-needs-fresh-proof") {
    return { error: "For your security, request a new email link and open it to continue." };
  }
  if (state.kind !== "claimable") return { error: "There's no application record to connect to this sign-in." };

  const { data: cand } = await service
    .from("candidate_profiles")
    .select("first_name, last_name")
    .eq("id", state.candidateId)
    .maybeSingle();
  const bound = await bindClaimedCandidate(service, {
    candidateId: state.candidateId,
    profileId: state.profileId,
    authUserId: identity.authUserId,
    email: identity.email ?? "",
    displayName: `${cand?.first_name ?? ""} ${cand?.last_name ?? ""}`.trim(),
  });
  if (!bound.ok) return { error: UNAVAILABLE };
  console.info("[candidate-claim]", { event: "claimed", candidateId: state.candidateId });
  redirect("/candidate/activate");
}

export async function signOutOfActivation() {
  const auth = await getSupabaseServerAuthClient();
  if (auth) await auth.auth.signOut();
  redirect("/candidate/activate");
}
