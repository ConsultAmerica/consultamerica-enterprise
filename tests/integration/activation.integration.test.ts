import { beforeAll, describe, expect, it } from "vitest";

import { provisionCandidatePortalAccount } from "@/lib/candidate/provisioning";
import { classifyVerifyError, requestCandidateAccess, resolveActivation } from "@/lib/candidate-portal/activation";
import {
  bindClaimedCandidate,
  createAccessRequestPorts,
  createActivationPorts,
  currentActivationIdentity,
} from "@/lib/candidate-portal/activation-supabase";

import { anon, check, checkRow, createApplicant, latestAuthLink, messageCount, service, testEmail, uid } from "./helpers";

const db = service();

async function acceptInvite(email: string) {
  const link = await latestAuthLink(email);
  expect(link.pathname).toBe("/auth/confirm");
  expect(link.searchParams.get("type")).toBe("invite");
  expect(link.searchParams.get("next")).toBe("/candidate/activate");
  const client = anon();
  const verified = await client.auth.verifyOtp({ token_hash: link.searchParams.get("token_hash")!, type: "invite" });
  return { link, client, verified };
}

describe("candidate invitation & activation (local Supabase Auth)", () => {
  let email: string;
  let candidateId: string;

  beforeAll(async () => {
    email = testEmail("invitee");
    candidateId = await createApplicant(db, email);
  });

  it("1. invitation: binds a new auth user to the applicant record server-side and emails a token-hash link", async () => {
    await provisionCandidatePortalAccount({ candidateId, email, displayName: "Test Applicant" });
    const cand = checkRow(await db.from("candidate_profiles").select("profile_id").eq("id", candidateId).single(), "cand");
    expect(cand.profile_id).toBeTruthy();
    const profile = checkRow(await db.from("profiles").select("id, status, auth_user_id").eq("id", cand.profile_id).single(), "profile");
    expect(profile.status).toBe("INVITED");
    const roles = checkRow(await db.from("user_roles").select("role").eq("user_id", profile.id), "roles");
    expect(roles.map((r) => r.role)).toEqual(["CANDIDATE"]);
    const { data: authUser } = await db.auth.admin.getUserById(profile.auth_user_id);
    expect(authUser.user?.email).toBe(email);
    expect(authUser.user?.email_confirmed_at).toBeFalsy(); // not verified until the link is opened
    expect(await messageCount(email)).toBe(1);
  });

  it("2/4. acceptance: the single-use token verifies the inbox and the session resolves to THIS candidate", async () => {
    const { client, verified } = await acceptInvite(email);
    expect(verified.error).toBeNull();
    const user = verified.data.user!;
    expect(user.email_confirmed_at).toBeTruthy();
    const state = await resolveActivation(
      { authUserId: user.id, email: user.email ?? null, emailConfirmed: true },
      createActivationPorts(db),
    );
    expect(state).toEqual({ kind: "ready", candidateId, profileId: expect.any(String) });

    // establish credentials
    const pw = `Activ8-${uid()}!`;
    expect((await client.auth.updateUser({ password: pw })).error).toBeNull();

    // 3. sign-in with the new password
    const fresh = anon();
    const signedIn = await fresh.auth.signInWithPassword({ email, password: pw });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.user?.id).toBe(user.id);
  });

  it("reused invitation link is rejected", async () => {
    const link = await latestAuthLink(email);
    const again = await anon().auth.verifyOtp({ token_hash: link.searchParams.get("token_hash")!, type: "invite" });
    expect(again.error).toBeTruthy();
    expect(["expired", "invalid"]).toContain(classifyVerifyError(again.error));
  });

  it("invalid / tampered token is rejected", async () => {
    const bad = await anon().auth.verifyOtp({ token_hash: "0".repeat(56), type: "invite" });
    expect(bad.error).toBeTruthy();
    expect(["expired", "invalid"]).toContain(classifyVerifyError(bad.error));
  });

  it("expired token maps to the 'expired' message", () => {
    expect(classifyVerifyError({ code: "otp_expired", message: "Email link is invalid or has expired" })).toBe("expired");
  });
});

describe("verified account claim & resend (uniform, inbox-verified)", () => {
  it("earlier applicant without an account: claim sends an invitation; nothing is linked until it is opened", async () => {
    const email = testEmail("claimant");
    const candidateId = await createApplicant(db, email);
    expect(await requestCandidateAccess(email.toUpperCase(), createAccessRequestPorts(db))).toBe("invite");
    const link = await latestAuthLink(email);
    // The account exists but is unverified: it cannot sign in and resolves to nothing usable yet.
    const cand = checkRow(await db.from("candidate_profiles").select("profile_id").eq("id", candidateId).single(), "cand");
    const prof = checkRow(await db.from("profiles").select("auth_user_id").eq("id", cand.profile_id).single(), "prof");
    const pending = await resolveActivation({ authUserId: prof.auth_user_id, email, emailConfirmed: false }, createActivationPorts(db));
    expect(pending).toEqual({ kind: "unverified" });

    const verified = await anon().auth.verifyOtp({ token_hash: link.searchParams.get("token_hash")!, type: "invite" });
    expect(verified.error).toBeNull();
    expect(verified.data.user?.id).toBe(prof.auth_user_id);
  });

  it("resend for an unaccepted invitation issues a new link and the old one stops working", async () => {
    const email = testEmail("resend");
    const candidateId = await createApplicant(db, email);
    await provisionCandidatePortalAccount({ candidateId, email, displayName: "Resend Test" });
    const first = await latestAuthLink(email);
    const before = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 1100));
    expect(await requestCandidateAccess(email, createAccessRequestPorts(db))).toBe("reinvite");
    const second = await latestAuthLink(email, { after: before });
    expect(second.searchParams.get("token_hash")).not.toBe(first.searchParams.get("token_hash"));
    expect((await anon().auth.verifyOtp({ token_hash: first.searchParams.get("token_hash")!, type: "invite" })).error).toBeTruthy();
    expect((await anon().auth.verifyOtp({ token_hash: second.searchParams.get("token_hash")!, type: "invite" })).error).toBeNull();
  });

  it("activated account gets a one-time sign-in link (also the forgot-password path)", async () => {
    const email = testEmail("active");
    const candidateId = await createApplicant(db, email);
    await provisionCandidatePortalAccount({ candidateId, email, displayName: "Active" });
    const invite = await latestAuthLink(email);
    await anon().auth.verifyOtp({ token_hash: invite.searchParams.get("token_hash")!, type: "invite" });
    const before = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 1100));
    expect(await requestCandidateAccess(email, createAccessRequestPorts(db))).toBe("sign-in-link");
    const magic = await latestAuthLink(email, { after: before });
    expect(magic.searchParams.get("type")).toBe("magiclink");
    expect((await anon().auth.verifyOtp({ token_hash: magic.searchParams.get("token_hash")!, type: "magiclink" })).error).toBeNull();
  });

  it("unknown email: no account, no email, same response path", async () => {
    const email = testEmail("nobody");
    expect(await requestCandidateAccess(email, createAccessRequestPorts(db))).toBe("none");
    expect(await messageCount(email)).toBe(0);
    const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
    expect(data.users.some((u) => u.email === email)).toBe(false);
  });

  it("an account with the same email is NOT linked to an applicant's history by email alone", async () => {
    const email = testEmail("lookalike");
    const candidateId = await createApplicant(db, email);
    // Someone creates an auth account with that address outside the invitation flow (e.g. a future signup).
    const created = await db.auth.admin.createUser({ email, password: `Pw-${uid()}-9`, email_confirm: true });
    expect(created.error).toBeNull();
    // Without fresh proof of the inbox nothing is linked; the claim must be re-proven by email first.
    const state = await resolveActivation(
      { authUserId: created.data.user!.id, email, emailConfirmed: true },
      createActivationPorts(db),
    );
    expect(state).toEqual({ kind: "claim-needs-fresh-proof" });
    const cand = checkRow(await db.from("candidate_profiles").select("profile_id").eq("id", candidateId).single(), "cand");
    expect(cand.profile_id).toBeNull();
  });

  it("verified claim: existing sign-in gets a link, fresh emailed-link proof claims the unlinked record; password sessions and replays cannot", async () => {
    const email = testEmail("orphan");
    const password = `Orph4n-${uid()}!`;
    const candidateId = await createApplicant(db, email);
    // An earlier self-signup left a verified sign-in that was never bound to the applicant record.
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const authUserId = created.data.user!.id;

    // Password session (real Supabase JWT, amr=password): not fresh inbox proof.
    const pwClient = anon();
    expect((await pwClient.auth.signInWithPassword({ email, password })).error).toBeNull();
    const pwIdentity = await currentActivationIdentity(pwClient as never);
    expect(pwIdentity?.freshEmailProof).toBe(false);
    expect(await resolveActivation(pwIdentity!, createActivationPorts(db))).toEqual({ kind: "claim-needs-fresh-proof" });

    // "Email me a link": invitation is impossible (sign-in exists) → one-time sign-in link instead.
    const before = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 1100)); // Mailpit timestamps vs. this clock (same guard as the tests above)
    expect(await requestCandidateAccess(email, createAccessRequestPorts(db))).toBe("claim-sign-in-link");
    const link = await latestAuthLink(email, { after: before });
    expect(link.searchParams.get("type")).toBe("magiclink");
    const linkClient = anon();
    expect((await linkClient.auth.verifyOtp({ token_hash: link.searchParams.get("token_hash")!, type: "magiclink" })).error).toBeNull();

    // Same user, now with fresh proof from the real JWT amr → claimable.
    const identity = await currentActivationIdentity(linkClient as never);
    expect(identity).toMatchObject({ authUserId, emailConfirmed: true, freshEmailProof: true });
    const state = await resolveActivation(identity!, createActivationPorts(db));
    expect(state).toEqual({ kind: "claimable", candidateId, profileId: null });
    if (state.kind !== "claimable") return;

    const bound = await bindClaimedCandidate(db, { candidateId, profileId: null, authUserId, email, displayName: "Orphan" });
    expect(bound.ok).toBe(true);
    expect(await resolveActivation(identity!, createActivationPorts(db))).toEqual({ kind: "ready", candidateId, profileId: expect.any(String) });

    // Replay (e.g. a second tab, or a racing request) cannot re-point the record or mint another profile.
    const replay = await bindClaimedCandidate(db, { candidateId, profileId: null, authUserId, email, displayName: "Orphan" });
    expect(replay.ok).toBe(false);
    const profiles = check(await db.from("profiles").select("id").eq("auth_user_id", authUserId), "profiles");
    expect(profiles).toHaveLength(1);
  });

  it("a staff sign-in with the applicant's address cannot claim the record, even with fresh proof", async () => {
    const email = testEmail("staffclaim");
    const candidateId = await createApplicant(db, email);
    const created = await db.auth.admin.createUser({ email, password: `Pw-${uid()}-9`, email_confirm: true });
    const profileId = `profile-staff-${uid()}`;
    check(await db.from("profiles").insert({ id: profileId, email, display_name: "Staff", status: "ACTIVE", auth_user_id: created.data.user!.id }), "p");
    check(await db.from("user_roles").insert({ id: `${profileId}-r`, user_id: profileId, role: "RECRUITER" }), "r");
    const state = await resolveActivation(
      { authUserId: created.data.user!.id, email, emailConfirmed: true, freshEmailProof: true },
      createActivationPorts(db),
    );
    expect(state).toEqual({ kind: "not-candidate" });
    const cand = checkRow(await db.from("candidate_profiles").select("profile_id").eq("id", candidateId).single(), "cand");
    expect(cand.profile_id).toBeNull();
  });

  it("staff accounts never resolve as candidates", async () => {
    const email = testEmail("recruiter");
    const created = await db.auth.admin.createUser({ email, password: `Pw-${uid()}-9`, email_confirm: true });
    const profileId = `profile-staff-${uid()}`;
    check(await db.from("profiles").insert({ id: profileId, email, display_name: "Staff", status: "ACTIVE", auth_user_id: created.data.user!.id }), "p");
    check(await db.from("user_roles").insert({ id: `${profileId}-r`, user_id: profileId, role: "RECRUITER" }), "r");
    const state = await resolveActivation({ authUserId: created.data.user!.id, email, emailConfirmed: true }, createActivationPorts(db));
    expect(state).toEqual({ kind: "not-candidate" });
  });
});
