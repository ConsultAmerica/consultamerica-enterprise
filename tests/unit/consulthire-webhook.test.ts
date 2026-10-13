import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * lib/consulthire/client.ts opens with `import "server-only"`, which throws
 * outside a React Server Component. Same stub the existing apply-actions test
 * uses, for the same reason: the module under test is server-only by design and
 * that import is the guard, not the behaviour.
 */
vi.mock("server-only", () => ({}));

const { verifyWebhookSignature, WEBHOOK_TOLERANCE_SECONDS, SECOND_ROUND_THRESHOLD } =
  await import("@/lib/consulthire/client");
const { secondRoundEligibility, parseScore } = await import(
  "@/lib/consulthire/second-round"
);

/** 32 characters minimum, which consultHireConfig and the verifier both require. */
const SECRET = "test-secret-with-enough-length-0123456789";
const NOW = new Date("2026-10-12T12:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);

/** Signs the way ConsultHire's src/lib/partnerWebhook.ts signs. */
function sign(timestamp: string, body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

const BODY = JSON.stringify({
  event: "interview.completed",
  interviewSessionId: "chr_session_1",
  externalAppId: "11111111-2222-3333-4444-555555555555",
  score: 8.5,
  verdict: "Strong match",
  report: null,
  completedAt: "2026-10-12T11:58:00.000Z",
  transcriptUrl: null,
});

describe("ConsultHire webhook signature verification", () => {
  beforeEach(() => {
    vi.stubEnv("CONSULTHIRE_WEBHOOK_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a correctly signed, fresh delivery", () => {
    const ts = String(NOW_SECONDS);
    expect(verifyWebhookSignature(BODY, ts, sign(ts, BODY), NOW)).toEqual({ ok: true });
  });

  it("rejects a tampered body under the original signature", () => {
    // The attack this exists to stop: a captured delivery with the score
    // rewritten. The signature still belongs to the honest body.
    const ts = String(NOW_SECONDS);
    const signature = sign(ts, BODY);
    const forged = BODY.replace('"score":8.5', '"score":10');

    expect(forged).not.toBe(BODY);
    expect(verifyWebhookSignature(forged, ts, signature, NOW)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("rejects a signature made with a different secret", () => {
    const ts = String(NOW_SECONDS);
    const wrong = sign(ts, BODY, "a-completely-different-secret-0123456789");
    expect(verifyWebhookSignature(BODY, ts, wrong, NOW)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("rejects a signature of a shorter length without throwing", () => {
    // timingSafeEqual requires equal-length buffers and raises otherwise, so a
    // truncated signature has to be caught by the length check first. A throw
    // here would be a 500 on a public endpoint instead of a 401.
    const ts = String(NOW_SECONDS);
    expect(verifyWebhookSignature(BODY, ts, "abc", NOW)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("rejects a replay from outside the tolerance window", () => {
    const oldTs = String(NOW_SECONDS - WEBHOOK_TOLERANCE_SECONDS - 1);
    // Correctly signed for ITS timestamp, which is the point: the signature is
    // genuine and the request is still refused because it is too old.
    expect(verifyWebhookSignature(BODY, oldTs, sign(oldTs, BODY), NOW)).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("rejects a timestamp too far in the future", () => {
    // Tolerance is absolute, so a clock that has run ahead is refused too.
    // Without this, a far-future timestamp would be accepted forever.
    const futureTs = String(NOW_SECONDS + WEBHOOK_TOLERANCE_SECONDS + 1);
    expect(verifyWebhookSignature(BODY, futureTs, sign(futureTs, BODY), NOW)).toEqual({
      ok: false,
      reason: "stale",
    });
  });

  it("accepts a delivery at the edge of the tolerance window", () => {
    const edgeTs = String(NOW_SECONDS - WEBHOOK_TOLERANCE_SECONDS);
    expect(verifyWebhookSignature(BODY, edgeTs, sign(edgeTs, BODY), NOW)).toEqual({ ok: true });
  });

  it("rejects a fresh timestamp paired with an older body's signature", () => {
    // THE RECOMBINATION ATTACK the signed `timestamp.body` pair exists to stop.
    // If the timestamp were merely a header alongside an HMAC of the body, an
    // attacker could replay a captured body indefinitely by attaching a fresh
    // timestamp. Because both are inside the signed material, they cannot be
    // mixed and matched.
    const oldTs = String(NOW_SECONDS - 600);
    const capturedSignature = sign(oldTs, BODY);
    const freshTs = String(NOW_SECONDS);

    expect(verifyWebhookSignature(BODY, freshTs, capturedSignature, NOW)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });

  it("reports missing headers separately from a bad signature", () => {
    const ts = String(NOW_SECONDS);
    expect(verifyWebhookSignature(BODY, null, sign(ts, BODY), NOW)).toEqual({
      ok: false,
      reason: "missing-headers",
    });
    expect(verifyWebhookSignature(BODY, ts, null, NOW)).toEqual({
      ok: false,
      reason: "missing-headers",
    });
    // A non-numeric timestamp cannot be aged, so it is a malformed header
    // rather than a stale or forged one.
    expect(verifyWebhookSignature(BODY, "not-a-number", sign(ts, BODY), NOW)).toEqual({
      ok: false,
      reason: "missing-headers",
    });
  });

  it("reports an unset secret as not-configured rather than accepting anything", () => {
    vi.stubEnv("CONSULTHIRE_WEBHOOK_SECRET", "");
    const ts = String(NOW_SECONDS);
    expect(verifyWebhookSignature(BODY, ts, sign(ts, BODY), NOW)).toEqual({
      ok: false,
      reason: "not-configured",
    });
  });

  it("treats a too-short secret as not configured", () => {
    // A 32-character floor, so a placeholder like "changeme" cannot quietly
    // become the trust root of a public endpoint.
    vi.stubEnv("CONSULTHIRE_WEBHOOK_SECRET", "short");
    const ts = String(NOW_SECONDS);
    expect(verifyWebhookSignature(BODY, ts, sign(ts, BODY, "short"), NOW)).toEqual({
      ok: false,
      reason: "not-configured",
    });
  });

  it("verifies the exact bytes, so re-serialised JSON does not match", () => {
    // Why the route must read req.text() before req.json(): parsing and
    // re-stringifying produces different bytes, and the HMAC is over bytes.
    const ts = String(NOW_SECONDS);
    const signature = sign(ts, BODY);
    const reserialised = JSON.stringify({ ...JSON.parse(BODY), score: 8.5 });
    const reordered = JSON.stringify({
      externalAppId: "11111111-2222-3333-4444-555555555555",
      event: "interview.completed",
      interviewSessionId: "chr_session_1",
      score: 8.5,
    });

    expect(verifyWebhookSignature(reserialised, ts, signature, NOW).ok).toBe(true);
    // Same facts, different key order: a verifier built on a parsed object
    // would accept this, and one built on raw bytes correctly does not.
    expect(verifyWebhookSignature(reordered, ts, signature, NOW)).toEqual({
      ok: false,
      reason: "bad-signature",
    });
  });
});

describe("second-round threshold", () => {
  const scored = (score: string | null, extra: Record<string, unknown> = {}) =>
    ({
      score,
      second_round_sent_at: null,
      status: "COMPLETED",
      ...extra,
    }) as Parameters<typeof secondRoundEligibility>[0];

  it("is 8 out of 10", () => {
    expect(SECOND_ROUND_THRESHOLD).toBe(8);
  });

  it("admits a score exactly at the threshold", () => {
    // AT OR ABOVE, not above. An 8.0 is explicitly eligible, and an
    // off-by-one here silently excludes every candidate who scores the bar.
    expect(secondRoundEligibility(scored("8"))).toEqual({ eligible: true, score: 8 });
    expect(secondRoundEligibility(scored("8.00"))).toEqual({ eligible: true, score: 8 });
  });

  it("admits scores above the threshold, including a perfect ten", () => {
    expect(secondRoundEligibility(scored("8.50"))).toEqual({ eligible: true, score: 8.5 });
    expect(secondRoundEligibility(scored("10.00"))).toEqual({ eligible: true, score: 10 });
  });

  it("refuses a score just below the threshold and names it", () => {
    expect(secondRoundEligibility(scored("7.99"))).toEqual({
      eligible: false,
      reason: "below-threshold",
      score: 7.99,
    });
    expect(secondRoundEligibility(scored("0"))).toEqual({
      eligible: false,
      reason: "below-threshold",
      score: 0,
    });
  });

  it("compares numerically, not as strings", () => {
    // "10.00" >= "9" is FALSE as a string comparison, so a lexical compare
    // would reject the best candidate the system can produce.
    expect(secondRoundEligibility(scored("10.00")).eligible).toBe(true);
    expect(secondRoundEligibility(scored("9.00")).eligible).toBe(true);
  });

  it("separates an unscored interview from a low-scoring one", () => {
    // Zero is a real result and null is an absent one. Treating null as 0
    // would report an interview nobody has sat as a candidate who did badly.
    expect(secondRoundEligibility(scored(null))).toEqual({
      eligible: false,
      reason: "not-scored",
      score: null,
    });
  });

  it("refuses a second send once an invitation has gone out", () => {
    // Checked before the score, so a re-score that moved 9 down to 7 still
    // reports "already sent": the candidate has the email either way.
    expect(
      secondRoundEligibility(
        scored("9.00", { second_round_sent_at: new Date("2026-10-11T09:00:00.000Z") }),
      ),
    ).toEqual({ eligible: false, reason: "already-sent", score: 9 });

    expect(
      secondRoundEligibility(
        scored("7.00", { second_round_sent_at: new Date("2026-10-11T09:00:00.000Z") }),
      ),
    ).toEqual({ eligible: false, reason: "already-sent", score: 7 });
  });

  it("refuses when there is no interview at all", () => {
    expect(secondRoundEligibility(null)).toEqual({
      eligible: false,
      reason: "no-interview",
      score: null,
    });
    expect(secondRoundEligibility(undefined)).toEqual({
      eligible: false,
      reason: "no-interview",
      score: null,
    });
  });

  it("parses NUMERIC strings and rejects unparseable ones", () => {
    expect(parseScore("8.50")).toBe(8.5);
    expect(parseScore(8.5)).toBe(8.5);
    expect(parseScore(null)).toBeNull();
    expect(parseScore(undefined)).toBeNull();
    // Not 0, which would read as "interviewed badly" rather than "no score".
    expect(parseScore("not-a-number")).toBeNull();
  });
});
