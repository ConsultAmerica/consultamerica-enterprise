import { describe, expect, it, vi } from "vitest";

import {
  CLAIM_PROOF_MAX_AGE_SECONDS,
  hasFreshEmailProof,
  requestCandidateAccess,
  resolveActivation,
  type AccessRequestPorts,
  type ActivationPorts,
  type AuthIdentity,
} from "@/lib/candidate-portal/activation";

const NOW = 1_800_000_000;

function activationPorts(overrides: Partial<ActivationPorts> = {}): ActivationPorts {
  return {
    findProfileByAuthUser: async () => null,
    hasCandidateRole: async () => false,
    findCandidateByProfile: async () => null,
    listRoles: async () => [],
    findUnlinkedCandidatesByEmail: async () => [],
    ...overrides,
  };
}

const identity = (extra: Partial<AuthIdentity> = {}): AuthIdentity => ({
  authUserId: "auth-1",
  email: "Applicant@Example.com",
  emailConfirmed: true,
  freshEmailProof: true,
  ...extra,
});

describe("resolveActivation", () => {
  it("bound candidate → ready (never looks for claimable records)", async () => {
    const findUnlinked = vi.fn(async () => [{ candidateId: "cand-other" }]);
    const state = await resolveActivation(
      identity(),
      activationPorts({
        findProfileByAuthUser: async () => ({ profileId: "p1", status: "INVITED" }),
        hasCandidateRole: async () => true,
        findCandidateByProfile: async () => ({ candidateId: "cand-1" }),
        findUnlinkedCandidatesByEmail: findUnlinked,
      }),
    );
    expect(state).toEqual({ kind: "ready", candidateId: "cand-1", profileId: "p1" });
    expect(findUnlinked).not.toHaveBeenCalled();
  });

  it("unverified email → unverified, nothing else consulted", async () => {
    const findProfile = vi.fn(async () => null);
    expect(await resolveActivation(identity({ emailConfirmed: false }), activationPorts({ findProfileByAuthUser: findProfile }))).toEqual({
      kind: "unverified",
    });
    expect(findProfile).not.toHaveBeenCalled();
  });

  it("verified sign-in without a record + exactly one unlinked record at its address + fresh proof → claimable", async () => {
    const findUnlinked = vi.fn(async () => [{ candidateId: "cand-9" }]);
    const state = await resolveActivation(identity(), activationPorts({ findUnlinkedCandidatesByEmail: findUnlinked }));
    expect(state).toEqual({ kind: "claimable", candidateId: "cand-9", profileId: null });
    expect(findUnlinked).toHaveBeenCalledWith("applicant@example.com");
  });

  it("same, but the session is not a fresh emailed-link sign-in → must re-prove the inbox first", async () => {
    const state = await resolveActivation(
      identity({ freshEmailProof: false }),
      activationPorts({ findUnlinkedCandidatesByEmail: async () => [{ candidateId: "cand-9" }] }),
    );
    expect(state).toEqual({ kind: "claim-needs-fresh-proof" });
  });

  it("staff sign-ins can never claim an applicant record", async () => {
    const state = await resolveActivation(
      identity(),
      activationPorts({
        findProfileByAuthUser: async () => ({ profileId: "staff-1", status: "ACTIVE" }),
        listRoles: async () => ["RECRUITER"],
        findUnlinkedCandidatesByEmail: async () => [{ candidateId: "cand-9" }],
      }),
    );
    expect(state).toEqual({ kind: "not-candidate" });
  });

  it("disabled profiles and ambiguous (several) matches are refused", async () => {
    expect(
      await resolveActivation(
        identity(),
        activationPorts({ findProfileByAuthUser: async () => ({ profileId: "p", status: "DISABLED" }) }),
      ),
    ).toEqual({ kind: "not-candidate" });
    expect(
      await resolveActivation(
        identity(),
        activationPorts({ findUnlinkedCandidatesByEmail: async () => [{ candidateId: "a" }, { candidateId: "b" }] }),
      ),
    ).toEqual({ kind: "not-candidate" });
  });

  it("an existing candidate-only profile without a record can claim (keeps its profile id)", async () => {
    const state = await resolveActivation(
      identity(),
      activationPorts({
        findProfileByAuthUser: async () => ({ profileId: "p-orphan", status: "ACTIVE" }),
        hasCandidateRole: async () => true,
        listRoles: async () => ["CANDIDATE"],
        findUnlinkedCandidatesByEmail: async () => [{ candidateId: "cand-9" }],
      }),
    );
    expect(state).toEqual({ kind: "claimable", candidateId: "cand-9", profileId: "p-orphan" });
  });
});

describe("hasFreshEmailProof", () => {
  it("accepts emailed-link methods within the window", () => {
    expect(hasFreshEmailProof([{ method: "otp", timestamp: NOW - 60 }], NOW)).toBe(true);
    expect(hasFreshEmailProof([{ method: "invite", timestamp: NOW }], NOW)).toBe(true);
    expect(hasFreshEmailProof([{ method: "magiclink", timestamp: NOW - 10 }], NOW)).toBe(true);
  });

  it("rejects passwords, old proofs, future timestamps and malformed input", () => {
    expect(hasFreshEmailProof([{ method: "password", timestamp: NOW }], NOW)).toBe(false);
    expect(hasFreshEmailProof([{ method: "otp", timestamp: NOW - CLAIM_PROOF_MAX_AGE_SECONDS - 1 }], NOW)).toBe(false);
    expect(hasFreshEmailProof([{ method: "otp", timestamp: NOW + 3600 }], NOW)).toBe(false);
    expect(hasFreshEmailProof(["otp"], NOW)).toBe(false);
    expect(hasFreshEmailProof(undefined, NOW)).toBe(false);
  });
});

describe("requestCandidateAccess", () => {
  function accessPorts(overrides: Partial<AccessRequestPorts> = {}) {
    const calls: string[] = [];
    const ports: AccessRequestPorts = {
      findCandidatesByEmail: async () => [],
      findAuthUserForProfile: async () => null,
      invite: async () => {
        calls.push("invite");
        return "sent";
      },
      reinvite: async () => {
        calls.push("reinvite");
      },
      sendSignInLink: async () => {
        calls.push("sign-in-link");
      },
      ...overrides,
    };
    return { ports, calls };
  }

  it("unknown or invalid email → nothing sent", async () => {
    const { ports, calls } = accessPorts();
    expect(await requestCandidateAccess("nobody@example.com", ports)).toBe("none");
    expect(await requestCandidateAccess("not an email", ports)).toBe("none");
    expect(calls).toEqual([]);
  });

  it("unlinked record → invitation to the address on file", async () => {
    const { ports, calls } = accessPorts({
      findCandidatesByEmail: async () => [{ candidateId: "c1", profileId: null, displayName: "A" }],
    });
    expect(await requestCandidateAccess("a@example.com", ports)).toBe("invite");
    expect(calls).toEqual(["invite"]);
  });

  it("unlinked record whose address already has a sign-in → one-time sign-in link (claim path)", async () => {
    const { ports, calls } = accessPorts({
      findCandidatesByEmail: async () => [{ candidateId: "c1", profileId: null, displayName: "A" }],
      invite: async () => {
        calls.push("invite");
        return "email-exists";
      },
    });
    expect(await requestCandidateAccess("a@example.com", ports)).toBe("claim-sign-in-link");
    expect(calls).toEqual(["invite", "sign-in-link"]);
  });

  it("an account-linked record wins over an older unlinked case variant", async () => {
    const { ports, calls } = accessPorts({
      findCandidatesByEmail: async () => [
        { candidateId: "old-variant", profileId: null, displayName: "A" },
        { candidateId: "linked", profileId: "p1", displayName: "A" },
      ],
      findAuthUserForProfile: async () => ({ authUserId: "u1", emailConfirmed: true }),
    });
    expect(await requestCandidateAccess("a@example.com", ports)).toBe("sign-in-link");
    expect(calls).toEqual(["sign-in-link"]);
  });

  it("invitation never accepted → re-invite", async () => {
    const { ports, calls } = accessPorts({
      findCandidatesByEmail: async () => [{ candidateId: "c1", profileId: "p1", displayName: "A" }],
      findAuthUserForProfile: async () => ({ authUserId: "u1", emailConfirmed: false }),
    });
    expect(await requestCandidateAccess("a@example.com", ports)).toBe("reinvite");
    expect(calls).toEqual(["reinvite"]);
  });
});
