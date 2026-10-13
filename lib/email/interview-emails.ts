/**
 * The two emails an AI interview produces: a completion notification to the
 * recruiting inbox when a score arrives, and a second-round invitation to the
 * candidate when a recruiter sends one.
 *
 * Chrome (header, shell, button, footer) is imported from
 * lib/email/application-emails.ts rather than rebuilt, because these arrive in
 * the same inbox, about the same application, minutes apart, and have to read
 * as one product. Two copies of the Outlook-safe table markup would be two
 * things to keep in step.
 *
 * Rendering is pure: these build strings and never touch the network, so they
 * can be exercised without a mail provider. Only the two send* functions talk
 * to Resend, and each reports what was actually accepted rather than what was
 * attempted.
 *
 * Every interpolated value is escaped. The candidate's name is off a public
 * form, and the verdict, key signal, strengths and concerns were written by a
 * language model at another service: none of it is our text and all of it is
 * treated as hostile.
 */

import { CONTACT } from "@/data/marketing";
import {
  button,
  footer,
  header,
  internalNeonLinkRow,
  internalNeonLinkTextLines,
  origin,
  shell,
  FONT,
  type Rendered,
} from "@/lib/email/application-emails";
import {
  BLUE,
  INK,
  INK_2,
  INK_3,
  LINE,
  SITE,
  TINT,
  esc,
  escUrl,
  formatStamp,
} from "@/lib/email/enquiry-template";
import type { ConsultHireReport } from "@/lib/consulthire/report";

const DEFAULT_FROM = "Consult America <onboarding@resend.dev>";

// ------------------------------------------------ completion notification

export type InterviewCompletedEmailInput = {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  applicationId: string;
  applicationNumber: string;
  /** 0 to 10, or null when the session was too thin to score. */
  score: number | null;
  verdict: string | null;
  /** Already narrowed by lib/consulthire/report.ts, or null. */
  report: ConsultHireReport | null;
  /** True when the candidate is at or above the second-round threshold. */
  secondRoundEligible: boolean;
};

/**
 * A score and a sentence, set apart so it is the thing you see first.
 *
 * "Not scored" is rendered as prominently as a number, not hidden in small
 * print. A null score means the candidate abandoned the interview, and the
 * recruiter needs that as a fact rather than inferring it from a missing
 * figure, which looks identical to a rendering bug.
 */
function scoreBlock(score: number | null, verdict: string | null): string {
  const headline = score === null ? "Not scored" : `${score}/10`;
  const caption =
    score === null
      ? "The interview was not completed, so there is no score. This says nothing about the candidate."
      : verdict || "Scored by ConsultHire against this job description.";

  return `
        <tr>
          <td class="pad" style="padding:26px 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${TINT};border:1px solid ${LINE};border-left:3px solid ${BLUE};border-radius:0 10px 10px 0;">
              <tr>
                <td style="padding:20px 22px;">
                  <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${INK_3};padding-bottom:8px;">AI interview score</div>
                  <div style="font-family:${FONT};font-size:30px;font-weight:700;letter-spacing:-0.5px;color:${INK};">${esc(headline)}</div>
                  <div style="font-family:${FONT};font-size:13px;line-height:1.6;color:${INK_2};padding-top:8px;">${esc(caption)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

/** A titled bullet list, or nothing at all when the list is empty. */
function bullets(title: string, items: string[]): string {
  if (items.length === 0) return "";
  const rows = items
    .map(
      (item) => `
                  <tr>
                    <td style="padding:0 10px 0 0;vertical-align:top;font-family:${FONT};font-size:14px;line-height:1.7;color:${BLUE};font-weight:700;">&bull;</td>
                    <td style="padding:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.7;color:${INK_2};">${esc(item)}</td>
                  </tr>`,
    )
    .join("");

  return `
        <tr>
          <td class="pad" style="padding:24px 32px 0;">
            <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${INK_3};padding-bottom:10px;">${esc(title)}</div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              ${rows}
            </table>
          </td>
        </tr>`;
}

export function renderInterviewCompletedNotification(
  input: InterviewCompletedEmailInput,
  opts: { now?: Date } = {},
): Rendered {
  const stamp = formatStamp(opts.now ?? new Date());
  const headline = input.score === null ? "not completed" : `scored ${input.score}/10`;
  const subject = `AI Interview ${input.score === null ? "incomplete" : `${input.score}/10`} — ${input.jobTitle} | ${input.candidateName}`;

  const dashboardUrl = escUrl(`${origin()}/admin/applications/${input.applicationId}`);
  const strengths = input.report?.strengths ?? [];
  const concerns = input.report?.concerns ?? [];
  /*
    The developer escape hatch, pointed at the same application the dashboard
    button opens. Safe here because sendInterviewCompletedNotification below
    addresses this message to recruitingInbox(). It must not appear in
    renderSecondRoundInvitation, which is addressed to the candidate.

    Empty on any machine where the database cannot be read from the
    environment, which keeps the link out of the email entirely.
  */
  const neonLines = internalNeonLinkTextLines(input.applicationId);

  const body = `
${header("AI interview complete")}
        <tr>
          <td class="pad" style="padding:34px 32px 0;">
            <h1 class="h1" style="margin:0;font-family:${FONT};font-size:27px;line-height:1.25;font-weight:700;color:${INK};letter-spacing:-0.5px;">AI interview complete</h1>
            <p style="margin:12px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK_2};">
              <strong style="color:${INK};">${esc(input.candidateName)}</strong> finished the AI interview for
              <strong style="color:${BLUE};">${esc(input.jobTitle)}</strong> and ${esc(headline)}.
            </p>
            <p style="margin:10px 0 0;font-family:${FONT};font-size:13px;color:${INK_3};">Completed ${esc(stamp)} &middot; ${esc(input.applicationNumber)}</p>
          </td>
        </tr>
${scoreBlock(input.score, input.verdict)}
${
  input.report?.incomplete
    ? `        <tr>
          <td class="pad" style="padding:18px 32px 0;">
            <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${INK_2};background:#fdf3df;border:1px solid #f0dcb0;border-radius:8px;padding:12px 14px;">
              ConsultHire marked this interview incomplete, so the result is not a judgement on the
              candidate. Read it as partial evidence, not a low score.
            </p>
          </td>
        </tr>`
    : ""
}
${
  input.report?.keySignal
    ? `        <tr>
          <td class="pad" style="padding:22px 32px 0;">
            <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${INK_3};padding-bottom:8px;">Key signal</div>
            <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">${esc(input.report.keySignal)}</p>
          </td>
        </tr>`
    : ""
}
${bullets("Strengths", strengths)}
${bullets("Concerns", concerns)}
${
  input.secondRoundEligible
    ? `        <tr>
          <td class="pad" style="padding:24px 32px 0;">
            <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.7;color:${INK_2};background:#e8f4ee;border:1px solid #c7e3d4;border-radius:8px;padding:12px 14px;">
              This candidate is at or above the second-round bar. The dashboard has a
              <strong style="color:${INK};">Send second-round invitation</strong> button on this
              application; it can only be used once.
            </p>
          </td>
        </tr>`
    : ""
}
${button(dashboardUrl, "Open the full report")}
${internalNeonLinkRow(input.applicationId)}
        <tr><td style="height:28px;line-height:28px;font-size:0;">&nbsp;</td></tr>
${footer("Reply-to is set to<br />the candidate&rsquo;s address")}`;

  const html = shell(
    subject,
    `${input.candidateName} ${headline} on the AI interview for ${input.jobTitle}.`,
    body,
  );

  const text = [
    "AI INTERVIEW COMPLETE",
    "",
    `${input.candidateName} finished the AI interview for ${input.jobTitle} and ${headline}.`,
    `Completed ${stamp}`,
    "",
    "----------------------------------------",
    `Candidate: ${input.candidateName}`,
    `Email:     ${input.candidateEmail}`,
    `Role:      ${input.jobTitle}`,
    `Reference: ${input.applicationNumber}`,
    `Score:     ${input.score === null ? "Not scored (interview not completed)" : `${input.score}/10`}`,
    `Verdict:   ${input.verdict || "Not given"}`,
    "----------------------------------------",
    ...(input.report?.keySignal ? ["", `Key signal: ${input.report.keySignal}`] : []),
    ...(strengths.length ? ["", "STRENGTHS", ...strengths.map((s) => `- ${s}`)] : []),
    ...(concerns.length ? ["", "CONCERNS", ...concerns.map((c) => `- ${c}`)] : []),
    ...(input.secondRoundEligible
      ? ["", "This candidate is at or above the second-round bar. The dashboard can send the invitation."]
      : []),
    "",
    `Full report: ${origin()}/admin/applications/${input.applicationId}`,
    // Blank line only when there is a link to separate, so a notification
    // without one does not end up with two blank lines in a row.
    ...(neonLines.length ? ["", ...neonLines] : []),
    "",
    "Consult America — consultamerica.com",
  ].join("\n");

  return { subject, html, text };
}

// -------------------------------------------------- second-round invitation

export type SecondRoundEmailInput = {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  applicationNumber: string;
  /** The recruiter who pressed the button, so the candidate has a human name. */
  recruiterName?: string | null;
};

/** First name for a greeting; falls back to something neutral, never blank. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
}

/**
 * The invitation to a second round.
 *
 * MAKES NO COMMITMENT THE BUSINESS HAS NOT MADE, which is the same rule the
 * application confirmation follows. It does not promise a date, a format, an
 * interviewer or an outcome, because none of those exist yet at the moment a
 * recruiter presses the button: all that has happened is that somebody decided
 * to take this candidate further. It says exactly that and tells them a human
 * will be in touch to arrange it.
 *
 * It does not quote the AI score either. The number is an internal screening
 * signal, it carries a model's judgement of a person, and a candidate reading
 * "you scored 8.5" would reasonably treat it as a grade to argue with.
 */
export function renderSecondRoundInvitation(
  input: SecondRoundEmailInput,
  opts: { now?: Date } = {},
): Rendered {
  const stamp = formatStamp(opts.now ?? new Date());
  const subject = `Next steps on your application — ${input.jobTitle}`;
  const from = input.recruiterName?.trim()
    ? `${input.recruiterName.trim()} and the Consult America recruiting team`
    : "our recruiting team";

  const steps = [
    "Somebody from the recruiting team will email you to arrange a time that suits you.",
    "The conversation is with a person, not an automated interview.",
    "Nothing further is needed from you right now. Keep an eye on this inbox.",
  ];

  const stepsHtml = steps
    .map(
      (step) => `
                  <tr>
                    <td style="padding:0 10px 0 0;vertical-align:top;font-family:${FONT};font-size:15px;line-height:1.7;color:${BLUE};font-weight:700;">&bull;</td>
                    <td style="padding:0 0 10px;font-family:${FONT};font-size:15px;line-height:1.7;color:${INK_2};">${esc(step)}</td>
                  </tr>`,
    )
    .join("");

  const body = `
${header("Next steps")}
        <tr>
          <td class="pad" style="padding:34px 32px 0;">
            <h1 class="h1" style="margin:0;font-family:${FONT};font-size:27px;line-height:1.25;font-weight:700;color:${INK};letter-spacing:-0.5px;">We would like to take this further</h1>
            <p style="margin:16px 0 0;font-family:${FONT};font-size:15px;line-height:1.7;color:${INK_2};">
              Hi ${esc(firstName(input.candidateName))}, thank you for completing the interview for
              <strong style="color:${INK};">${esc(input.jobTitle)}</strong>. We have reviewed it and
              would like to invite you to a second conversation with ${esc(from)}.
            </p>
            <p style="margin:10px 0 0;font-family:${FONT};font-size:13px;color:${INK_3};">Sent ${esc(stamp)} &middot; Application ${esc(input.applicationNumber)}</p>
          </td>
        </tr>
        <tr>
          <td class="pad" style="padding:26px 32px 0;">
            <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${INK_3};padding-bottom:12px;">What happens next</div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              ${stepsHtml}
            </table>
          </td>
        </tr>
${button(`${SITE}/careers`, "See our open roles")}
        <tr><td style="height:30px;line-height:30px;font-size:0;">&nbsp;</td></tr>
${footer("Questions? Reply to<br />this email.")}`;

  const html = shell(
    subject,
    `We would like to invite you to a second conversation about ${input.jobTitle}.`,
    body,
  );

  const text = [
    "WE WOULD LIKE TO TAKE THIS FURTHER",
    "",
    `Hi ${firstName(input.candidateName)}, thank you for completing the interview for ${input.jobTitle}.`,
    `We have reviewed it and would like to invite you to a second conversation with ${from}.`,
    `Sent ${stamp}`,
    "",
    `Application reference: ${input.applicationNumber}`,
    "",
    "WHAT HAPPENS NEXT",
    ...steps.map((step) => `- ${step}`),
    "",
    `See our open roles: ${SITE}/careers`,
    "",
    "Consult America — consultamerica.com",
  ].join("\n");

  return { subject, html, text };
}

// --------------------------------------------------------------- delivery

/** One Resend send. Returns whether it was accepted; never throws. */
async function post(
  apiKey: string,
  label: "interview-complete" | "second-round",
  payload: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("[interview-email] resend failed", label, res.status, await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[interview-email] resend request failed", label, error);
    return false;
  }
}

function recruitingInbox(): string {
  return process.env.RECRUITING_TO || CONTACT.recruiting;
}

/**
 * Tell the recruiting inbox a score has landed.
 *
 * Never throws and reports honestly. The webhook that calls this has already
 * committed the result to the database and answered 200; an email failure must
 * not become a non-2xx, because ConsultHire would then redeliver a webhook that
 * has already been recorded.
 */
export async function sendInterviewCompletedNotification(
  input: InterviewCompletedEmailInput,
): Promise<{ notified: boolean }> {
  const rendered = renderInterviewCompletedNotification(input);
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Same degradation as the application emails: log enough to follow up by
    // hand, and report honestly that nothing was sent.
    console.warn(
      `[interview-email] RESEND_API_KEY not set — nothing sent.\n${rendered.subject}\n${rendered.text}`,
    );
    return { notified: false };
  }

  const notified = await post(apiKey, "interview-complete", {
    from: process.env.CONTACT_FROM || DEFAULT_FROM,
    to: [recruitingInbox()],
    // Hitting reply in the recruiting inbox should reach the candidate, which
    // is the same contract the new-application notification has.
    reply_to: input.candidateEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  return { notified };
}

/**
 * Invite a candidate to a second round.
 *
 * Returns false rather than throwing when it could not be sent, because the
 * caller has already claimed the send in the database and has to be able to
 * give that claim back. See claimSecondRoundSend in lib/neon/interviews.ts.
 */
export async function sendSecondRoundInvitation(
  input: SecondRoundEmailInput,
): Promise<{ sent: boolean }> {
  const rendered = renderSecondRoundInvitation(input);
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[interview-email] RESEND_API_KEY not set — nothing sent.\n${rendered.subject}\n${rendered.text}`,
    );
    return { sent: false };
  }

  const sent = await post(apiKey, "second-round", {
    from: process.env.CONTACT_FROM || DEFAULT_FROM,
    to: [input.candidateEmail],
    // A candidate replying to an invitation should reach recruiting, not a
    // noreply address: the next step in this email is literally a conversation.
    reply_to: recruitingInbox(),
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  return { sent };
}
