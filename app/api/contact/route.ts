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

  // Bot check sits here deliberately: after the free local validation and
  // before anything is sent. It used to be justified by the Anthropic call
  // this route made, which has since been removed; the reason now is simpler
  // and still good, which is that an unprotected public form becomes a way to
  // post arbitrary text into the company inbox. Running it after validation
  // also avoids burning a single-use token on a request we were going to
  // reject anyway.
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

  /*
    NO AI STEP. The enquiry goes straight out.

    This route used to ask Claude to write an internal routing note before
    sending anything, and the visitor waited for it. Measured at roughly eight
    seconds on every submission, which is what "Sending…" was. They got nothing
    for that wait: the note was for us, and this template already carries every
    field they typed, so the note restated what was directly underneath it.

    Removed rather than moved to the background. A second internal email
    paraphrasing the first is noise in the inbox, and an API call on a public
    form is a cost and a dependency that has to be justified. This one could
    not be.

    THE SEND IS AWAITED, DELIBERATELY. There is no database record of an
    enquiry; the email IS the record. Replying "sent" before the send has been
    accepted would mean a failed send loses a lead silently, and a lead nobody
    knows was lost is worse than a form that takes an extra moment. Resend
    answers in a few hundred milliseconds.
  */
  const { subject, html, text: body } = renderEnquiryEmail(enquiry);

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM || "Consult America <onboarding@resend.dev>";
  const to = process.env.CONTACT_TO || CONTACT.enquiries;

  if (!resendKey) {
    // No mail provider configured: log the whole thing so nothing is silently
    // dropped, and say it was received rather than claiming it was sent.
    console.warn(
      `[contact] RESEND_API_KEY not set — enquiry logged only.\nSubject: ${subject}\n${body}`,
    );
    return NextResponse.json({ ok: true, via: "logged", drafted: "template" });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${resendKey}` },
    body: JSON.stringify({
      from,
      to: [to],
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

  return NextResponse.json({ ok: true, via: "email" });
}
