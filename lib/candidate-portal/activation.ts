/**
 * Candidate account activation and verified account claiming — rules only
 * (I/O via ports, so they are unit-tested without Supabase).
 *
 * Identity model:
 *   An applicant's candidate record is linked to a sign-in ONLY by the server,
 *   at the moment it sends a Supabase Auth invitation to the email address on
 *   that record (lib/candidate/provisioning.ts binds profiles.auth_user_id to
 *   the invited auth user and candidate_profiles.profile_id to the profile).
 *   The link becomes usable only when someone proves control of that inbox by
 *   opening the single-use, expiring invitation link (verified by Supabase
 *   Auth in /auth/confirm). Activation then checks that the AUTHENTICATED auth
 *   user id is the one the server bound — it never matches on an email string.
 *
 *   Claiming (an earlier applicant without an account) and "resend my link"
 *   use the same mechanism: the server emails a fresh link to the address on
 *   file. The response never reveals whether that address has applications,
 *   and nothing is visible until the inbox owner opens the link.
 */

export type AuthIdentity = { authUserId: string; email: string | null; emailConfirmed: boolean };

export type ActivationPorts = {
  findProfileByAuthUser(authUserId: string): Promise<{ profileId: string; status: string | null } | null>;
  hasCandidateRole(profileId: string): Promise<boolean>;
  findCandidateByProfile(profileId: string): Promise<{ candidateId: string } | null>;
};

export type ActivationState =
  | { kind: "ready"; candidateId: string; profileId: string }
  | { kind: "unverified" }
  | { kind: "not-candidate" };

/** Whether the authenticated identity may activate a candidate account, and which one. */
export async function resolveActivation(identity: AuthIdentity, ports: ActivationPorts): Promise<ActivationState> {
  if (!identity.emailConfirmed) return { kind: "unverified" };
  const profile = await ports.findProfileByAuthUser(identity.authUserId);
  if (!profile || profile.status === "DISABLED" || profile.status === "SUSPENDED") return { kind: "not-candidate" };
  if (!(await ports.hasCandidateRole(profile.profileId))) return { kind: "not-candidate" };
  const candidate = await ports.findCandidateByProfile(profile.profileId);
  if (!candidate) return { kind: "not-candidate" };
  return { kind: "ready", candidateId: candidate.candidateId, profileId: profile.profileId };
}

export const MIN_PASSWORD_LENGTH = 10;

/** Server-side password rules (Supabase enforces its own minimum as well). */
export function validateNewPassword(password: string, confirm: string, email: string | null): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 72) return "Use 72 characters or fewer.";
  if (password !== confirm) return "The two passwords don't match.";
  if (email && password.toLowerCase().includes(email.split("@")[0]!.toLowerCase()) && email.split("@")[0]!.length >= 4) {
    return "Don't include your email name in your password.";
  }
  if (!/[a-z]/i.test(password) || !/[0-9\W_]/.test(password)) return "Use a mix of letters and numbers or symbols.";
  return null;
}

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export type AccessRequestPorts = {
  /** Candidate records whose email equals `email` (case-insensitive), oldest first. */
  findCandidatesByEmail(email: string): Promise<{ candidateId: string; profileId: string | null; displayName: string }[]>;
  /** The auth user bound to a profile, if any. */
  findAuthUserForProfile(profileId: string): Promise<{ authUserId: string; emailConfirmed: boolean } | null>;
  /** First-time claim: create the profile + CANDIDATE role and send a Supabase invitation. */
  invite(input: { candidateId: string; email: string; displayName: string }): Promise<void>;
  /** Resend an invitation to an existing profile whose invite was never accepted (binds a new auth user if needed). */
  reinvite(input: { profileId: string; email: string }): Promise<void>;
  /** Already-verified account: email a one-time sign-in link that lands on the set-password page. */
  sendSignInLink(email: string): Promise<void>;
};

export type AccessDecision = "none" | "invite" | "reinvite" | "sign-in-link";

/**
 * Handles "send me my activation / sign-in link". Every outcome looks the same
 * to the requester (see ACCESS_REQUEST_MESSAGE); the decision is returned for
 * logging and tests only.
 */
export async function requestCandidateAccess(rawEmail: string, ports: AccessRequestPorts): Promise<AccessDecision> {
  const email = normalizeEmail(rawEmail);
  if (!email) return "none";
  const [candidate] = await ports.findCandidatesByEmail(email);
  if (!candidate) return "none";

  if (!candidate.profileId) {
    await ports.invite({ candidateId: candidate.candidateId, email, displayName: candidate.displayName });
    return "invite";
  }
  const auth = await ports.findAuthUserForProfile(candidate.profileId);
  if (!auth || !auth.emailConfirmed) {
    await ports.reinvite({ profileId: candidate.profileId, email });
    return "reinvite";
  }
  await ports.sendSignInLink(email);
  return "sign-in-link";
}

/** Identical for every outcome, so the form can't be used to discover who has applied. */
export const ACCESS_REQUEST_MESSAGE =
  "If that email address is on an application with us, we've sent it a secure link to activate or sign in to your candidate account. The link expires and can be used once.";

export type ConfirmLinkError = "expired" | "invalid";

/** Maps a Supabase Auth verify failure to what we tell the candidate. */
export function classifyVerifyError(error: { code?: string | null; message?: string | null } | null): ConfirmLinkError {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return text.includes("expired") || text.includes("otp_expired") ? "expired" : "invalid";
}

/** Email-link types /auth/confirm accepts; anything else is rejected. */
export const CONFIRM_LINK_TYPES = ["invite", "magiclink", "email", "recovery"] as const;
export type ConfirmLinkType = (typeof CONFIRM_LINK_TYPES)[number];

export function isConfirmLinkType(value: string | null): value is ConfirmLinkType {
  return (CONFIRM_LINK_TYPES as readonly string[]).includes(value ?? "");
}
