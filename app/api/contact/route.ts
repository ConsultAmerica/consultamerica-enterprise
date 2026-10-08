import { NextResponse } from "next/server";

import { CONTACT } from "@/data/marketing";

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
 * Turn the form fields into a brief a specialist can act on without opening
 * the CRM. Uses Claude when ANTHROPIC_API_KEY is set; otherwise falls back to
 * a structured plain-text version of exactly the same facts, so the endpoint
 * never depends on the model being reachable.
 */
async function draftEmail(e: Enquiry): Promise<{ body: string; drafted: "ai" | "template" }> {
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
          return { body: `${text.trim()}\n\n--- Raw submission ---\n${facts}`, drafted: "ai" };
        }
      }
    } catch {
      // fall through to the template
    }
  }

  return {
    body:
      `New enquiry from consultamerica.com\n\n${facts}\n\n` +
      `Reply directly to ${e.email}.`,
    drafted: "template",
  };
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

  const { body, drafted } = await draftEmail(enquiry);
  const subject = `Enquiry: ${enquiry.company} — ${enquiry.interest}`;

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM || "Consult America <onboarding@resend.dev>",
        to: [process.env.CONTACT_TO || CONTACT.email],
        reply_to: enquiry.email,
        subject,
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
