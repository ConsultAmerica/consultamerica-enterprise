/**
 * The email a candidate receives when a recruiter moves their application to a
 * new hiring stage.
 *
 * ONE TEMPLATE, SEVEN MESSAGES. Every stage email is the same shell, the same
 * header and the same signature, differing only in three or four sentences.
 * Seven separate renderers would be seven places to update when the signature
 * changes, and the first one somebody forgets is the one a candidate reads.
 *
 * WHAT THESE MESSAGES ARE NOT ALLOWED TO DO.
 *
 * 1. Promise anything that has not happened. "Shortlisted" does not mean an
 *    interview is booked, and "Offer" does not mean an offer exists: an offer
 *    is a document somebody has to approve and sign, and a candidate who reads
 *    an automated stage change as an offer has been misled by us, not by their
 *    own optimism. The copy for that stage is deliberately the most careful in
 *    this file.
 * 2. Name a date, a time or a deadline. Nothing in this system knows one.
 * 3. Quote an AI interview score, for the reason written out in
 *    renderRejectionNotice: it is a model's judgement of a person and it is a
 *    screening signal, not a verdict to hand them.
 *
 * NOT EVERY STAGE WRITES TO THE CANDIDATE. NEW is what the application
 * confirmation already covered minutes earlier, and WITHDRAWN is the
 * candidate's own decision, which they do not need announcing back to them.
 * `stageEmailFor` returns null for both, and null is what stops a send.
 */

import { CONTACT } from "@/data/marketing";
import {
  FONT,
  type Rendered,
  footer,
  header,
  shell,
} from "@/lib/email/application-emails";
import { INK, INK_2, INK_3, esc, formatStamp } from "@/lib/email/enquiry-template";
import type { ApplicationStatus } from "@/lib/neon/types";

export type StageEmailInput = {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
};

/** First name for a greeting; never blank, never a placeholder glyph. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
}

/**
 * The words for one stage: the pill on the header, the subject, and the two or
 * three sentences in the body.
 *
 * Written as data rather than as markup so the whole set can be read side by
 * side. A tone that drifts between stages is only visible when they are in one
 * place, and this file exists to keep them there.
 *
 * `{role}` is substituted, not interpolated here, so the copy stays a plain
 * string that can be read and reviewed without HTML around it.
 */
const STAGE_COPY: Partial<
  Record<ApplicationStatus, { pill: string; subject: string; lines: readonly string[] }>
> = {
  SCREENING: {
    pill: "Application update",
    subject: "Your application is in review: {role}",
    lines: [
      "Thank you for your interest in the {role} position at Consult America.",
      "Your application has moved into screening and is now being reviewed by our recruiting team.",
      "We will be in touch once the review is complete. No action is needed from you in the meantime.",
    ],
  },
  INTERVIEW: {
    pill: "Application update",
    subject: "Next step in your application: {role}",
    lines: [
      "Thank you for your interest in the {role} position at Consult America.",
      "Your application has progressed to the interview stage.",
      // Deliberately no date, format or interviewer: nothing in this system
      // knows any of them, and inventing "within the week" is a promise a
      // recruiter then has to keep.
      "A member of our recruiting team will contact you directly to arrange the details.",
    ],
  },
  SHORTLISTED: {
    pill: "Application update",
    subject: "You have been shortlisted: {role}",
    lines: [
      "Thank you for your interest in the {role} position at Consult America.",
      "We are pleased to let you know that you have been shortlisted for this position.",
      "Our recruiting team will be in contact with you regarding the next steps.",
    ],
  },
  OFFER: {
    pill: "Application update",
    subject: "An update on your application: {role}",
    lines: [
      "Thank you for your interest in the {role} position at Consult America.",
      // THE CAREFUL ONE. It says a conversation is starting, not that an offer
      // exists. An offer is a document somebody has to approve and sign, and a
      // candidate who resigns from their job on the strength of an automated
      // stage change has been misled by us.
      "Your application has reached the offer stage of our process, and our recruiting team is preparing to discuss next steps with you.",
      "Nothing is confirmed until you receive a formal written offer from us. A member of the team will be in touch shortly.",
    ],
  },
  HIRED: {
    pill: "Welcome",
    subject: "Welcome to Consult America: {role}",
    lines: [
      "Congratulations, and welcome to Consult America.",
      "Your hiring for the {role} position is now confirmed.",
      "Our team will contact you with onboarding details, including your start date and everything you need for your first day.",
    ],
  },
};

/** True when moving to this stage sends the candidate an email. */
export function stageEmailApplies(status: ApplicationStatus): boolean {
  return status in STAGE_COPY;
}

/**
 * Render the email for one stage, or null when that stage does not write to
 * the candidate.
 *
 * REJECTED is absent on purpose and is not an oversight: it has its own
 * renderer in application-emails.ts, which the caller reaches first. Putting a
 * rejection in this file would mean two templates for the same message and a
 * tone that drifts between them.
 */
export function renderStageEmail(
  status: ApplicationStatus,
  input: StageEmailInput,
  opts: { now?: Date } = {},
): Rendered | null {
  const copy = STAGE_COPY[status];
  if (!copy) return null;

  const stamp = formatStamp(opts.now ?? new Date());
  const role = input.jobTitle;
  const fill = (line: string) => line.replace(/\{role\}/g, role);
  const subject = fill(copy.subject);

  const paragraphs = copy.lines
    .map((line, index) => {
      /*
        The role is bolded in the first paragraph only. Emphasising it three
        times would make the message read as a form letter with the blanks
        filled in, which is exactly what it must not look like.
      */
      const text =
        index === 0
          ? esc(fill(line)).replace(
              esc(role),
              `<strong style="color:${INK};">${esc(role)}</strong>`,
            )
          : esc(fill(line));
      return `
            <p style="margin:${index === 0 ? "16px" : "16px"} 0 0;font-family:${FONT};font-size:15px;line-height:1.7;color:${INK_2};">
              ${text}
            </p>`;
    })
    .join("");

  const body = `
${header(copy.pill)}
        <tr>
          <td class="pad" style="padding:34px 32px 0;">
            <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.7;color:${INK_2};">
              Hi ${esc(firstName(input.candidateName))},
            </p>${paragraphs}
            <p style="margin:26px 0 0;font-family:${FONT};font-size:15px;line-height:1.7;color:${INK_2};">
              Best regards,<br />
              <strong style="color:${INK};">Talent Acquisition Team</strong><br />
              Consult America Inc.
            </p>
            <p style="margin:18px 0 0;font-family:${FONT};font-size:13px;color:${INK_3};">${esc(stamp)}</p>
          </td>
        </tr>
        <tr><td style="height:30px;line-height:30px;font-size:0;">&nbsp;</td></tr>
${footer("Questions? Reply to<br />this email.")}`;

  const html = shell(subject, fill(copy.lines[1] ?? copy.lines[0]), body);

  const text = [
    `Hi ${firstName(input.candidateName)},`,
    "",
    ...copy.lines.flatMap((line) => [fill(line), ""]),
    "Best regards,",
    "Talent Acquisition Team",
    "Consult America Inc.",
    "",
    stamp,
  ].join("\n");

  return { subject, html, text };
}

/**
 * Send the stage email, if this stage has one.
 *
 * NEVER THROWS. The stage change is already committed by the time this runs,
 * and a mail provider being briefly unreachable is not a reason to tell a
 * recruiter their stage change failed. The return value is what the caller
 * records on the timeline.
 *
 * "skipped" and "failed" are different facts and are kept apart: skipped means
 * this stage does not write to candidates, failed means it does and the send
 * did not land. A recruiter needs to know which, because only one of them
 * leaves a person waiting to be told something.
 */
export async function sendStageEmail(
  status: ApplicationStatus,
  input: StageEmailInput,
): Promise<"sent" | "skipped" | "failed"> {
  const rendered = renderStageEmail(status, input);
  if (!rendered) return "skipped";

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[stage-email] RESEND_API_KEY not set, nothing sent for ${status}.\n${rendered.subject}`,
    );
    return "failed";
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM || "Consult America <onboarding@resend.dev>",
        to: [input.candidateEmail],
        // A candidate replying to any of these should reach a person.
        reply_to: process.env.RECRUITING_TO || CONTACT.recruiting,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }),
    });

    if (!res.ok) {
      console.error("[stage-email] resend failed", status, res.status, await res.text());
      return "failed";
    }

    const id = await res
      .clone()
      .json()
      .then((body: { id?: string }) => body?.id ?? "no id")
      .catch(() => "unparseable response");
    console.info("[stage-email] sent", status, id);
    return "sent";
  } catch (error) {
    console.error("[stage-email] resend request failed", status, error);
    return "failed";
  }
}
