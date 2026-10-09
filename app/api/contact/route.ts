import { NextResponse } from "next/server";

import { CONTACT } from "@/data/marketing";
import { renderEnquiryEmail } from "@/lib/email/enquiry-template";
import { verifyTurnstile } from "@/lib/security/turnstile";

export const runtime = "nodejs";

type Enquiry = {
  name: string;
  email: string;
  company: string;
  phone?: string;
  interest: string;
  message: string;
};

function clean(v: unknown, max: number) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * An optional routing brief a specialist can act on without opening the CRM.
 * Uses Claude when ANTHROPIC_API_KEY is set. Returns no brief if the model is
 * unreachable — the notification itself never depends on it, because the
 * template already carries every submitted field.
 */
async function draftEmail(e: Enquiry): Promise<{ brief?: string; drafted: "ai" | "template" }> {
  const facts =
    `Name: ${e.name}\nEmail: ${e.email}\nCompany: ${e.company}\n` +
    `Phone: ${e.phone || "not given"}\nInterest: ${e.interest}\n\nMessage:\n${e.message}`;

  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 700,
          system:
            "You write internal routing notes for an enterprise technology consultancy. " +
            "Given a website enquiry, produce a short plain-text brief for the specialist who will reply. " +
            "Sections: Summary (2 sentences), What they appear to need, Suggested first reply, Contact details. " +
            "Never invent facts, commitments, pricing or timelines that are not in the enquiry. " +
            "If something is unclear, say so plainly.",
          messages: [{ role: "user", content: `Website enquiry:\n\n${facts}` }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.content?.[0]?.text;
        if (typeof text === "string" && text.trim()) {
          return { brief: text.trim(), drafted: "ai" };
        }
      }
    } catch {
      // fall through to the template
    }
  }

  return { drafted: "template" };
}

export async function POST(req: Request) {
  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const enquiry: Enquiry = {
    name: clean(raw.name, 120),
    email: clean(raw.email, 200),
    company: clean(raw.company, 160),
    phone: clean(raw.phone, 60),
    interest: clean(raw.interest, 80),
    message: clean(raw.message, 5000),
  };

  if (!enquiry.name || !enquiry.email || !enquiry.company || !enquiry.message) {
    return NextResponse.json({ error: "Please complete the required fields." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(enquiry.email)) {
    return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 });
  }

  // Bot check sits here deliberately: after the free local validation, and
  // BEFORE draftEmail() — the only reason this endpoint needs protecting is
  // that it spends Anthropic credit on whatever is posted to it. Checking
  // afterwards would protect nothing. Running it after validation also avoids
  // burning a single-use token on a request we were going to 400 anyway.
  //
  // verifyTurnstile is a no-op until both keys are set, so with none configured
  // this adds no network call and cannot reject anybody.
  const remoteIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    undefined;
  const captcha = await verifyTurnstile(clean(raw.turnstileToken, 4096) || null, remoteIp);
  if (!captcha.ok) {
    console.warn("[contact] turnstile rejected submission", { reason: captcha.reason });
    return NextResponse.json(
      { error: "We couldn't confirm that you're a person. Please reload the page and try again." },
      { status: 403 },
    );
  }

  const { brief, drafted } = await draftEmail(enquiry);
  const { subject, html, text: body } = renderEnquiryEmail(enquiry, { brief });

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM || "Consult America <onboarding@resend.dev>",
        to: [process.env.CONTACT_TO || CONTACT.enquiries],
        reply_to: enquiry.email,
        subject,
        html,
        // plain-text alternative for clients that will not render HTML
        text: body,
      }),
    });
    if (!res.ok) {
      console.error("[contact] resend failed", res.status, await res.text());
      return NextResponse.json(
        { error: "We couldn't send that just now. Please email us directly." },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, via: "email", drafted });
  }

  // No mail provider configured yet: log the full brief so nothing is silently
  // dropped, and tell the client it was received rather than claiming it was sent.
  console.warn(
    `[contact] RESEND_API_KEY not set — enquiry logged only.\nSubject: ${subject}\n${body}`,
  );
  return NextResponse.json({ ok: true, via: "logged", drafted });
}
