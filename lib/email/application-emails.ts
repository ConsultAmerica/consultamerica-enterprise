/**
 * The two emails one job application produces: an internal notification to the
 * recruiting inbox, and a confirmation to the candidate.
 *
 * Built the same way as lib/email/enquiry-template.ts (tables, inline styles,
 * a single <style> block carrying only the mobile media query, an absolute
 * https logo) because that is what Outlook's Word renderer supports, and
 * because both emails should read as the same system. The palette and the
 * small render helpers are imported from that file rather than copied.
 *
 * Rendering is pure: these functions build strings and never touch the
 * network, so they can be exercised without a mail provider. Only
 * sendApplicationEmails talks to Resend, and it reports what it actually sent.
 *
 * Every interpolated value is escaped. Candidate name, email and phone come
 * straight off a public form and are treated as hostile.
 */

import { CONTACT } from "@/data/marketing";
import {
  BLUE,
  INK,
  INK_2,
  INK_3,
  LINE,
  LOGO,
  NAVY,
  NAVY_2,
  SITE,
  TINT,
  esc,
  escUrl,
  field,
  formatStamp,
  link,
  row,
  telHref,
} from "@/lib/email/enquiry-template";

export type ApplicationEmailInput = {
  /** Full name as the candidate typed it. */
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  jobTitle: string;
  /** Internal id; only ever appears in the dashboard link on the notification. */
  applicationId: string;
  /** The reference number the candidate can quote (APP-2026-0001). */
  applicationNumber: string;
  /** Which flow filed it ("Careers Site"...). Internal notification only. */
  source?: string;
};

type Rendered = { subject: string; html: string; text: string };

const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const DEFAULT_FROM = "Consult America <onboarding@resend.dev>";

/**
 * Origin for links inside emails. Falls back to the public site rather than
 * localhost: a missing env var in production should still produce a link that
 * reaches the real dashboard, not one that is dead in every inbox.
 */
function origin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || SITE;
  return raw.replace(/\/+$/, "");
}

/** First name for a greeting; falls back to something neutral, never blank. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
}

/** Shared chrome so both emails carry the identical header. */
function header(pill: string): string {
  return `
        <tr>
          <td style="background:${NAVY};padding:26px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="vertical-align:middle;width:42px;">
                  <img src="${LOGO}" width="38" height="38" alt="Consult America" style="display:block;width:38px;height:38px;border:0;border-radius:50%;" />
                </td>
                <td style="vertical-align:middle;padding-left:12px;">
                  <div style="font-family:${FONT};font-size:17px;font-weight:700;color:#ffffff;letter-spacing:-0.2px;line-height:1.2;">Consult America</div>
                  <div style="font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#6ea8f0;padding-top:2px;">Building Innovative Future</div>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="display:inline-block;font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#9fc4f5;background:${NAVY_2};border:1px solid #2b3d5e;border-radius:999px;padding:6px 12px;">${esc(pill)}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

function button(href: string, label: string): string {
  return `
        <tr>
          <td class="pad" style="padding:24px 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
              <tr>
                <td style="background:${BLUE};border-radius:999px;">
                  <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(label)} &rarr;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

function footer(note: string): string {
  return `
        <tr>
          <td style="background:${TINT};border-top:1px solid ${LINE};padding:22px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="font-family:${FONT};font-size:12px;line-height:1.6;color:${INK_3};">
                  Sent automatically by <strong style="color:${INK_2};">Consult America</strong><br />
                  <a href="${SITE}" style="color:${BLUE};text-decoration:none;">consultamerica.com</a>
                </td>
                <td align="right" style="font-family:${FONT};font-size:12px;line-height:1.6;color:${INK_3};">
                  ${note}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

/** The surrounding document: head, media query, preheader and the 600px card. */
function shell(subject: string, preheader: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${esc(subject)}</title>
<style>
  @media only screen and (max-width:600px){
    .col{display:block !important;width:100% !important;padding:12px 0 !important;}
    .pad{padding-left:20px !important;padding-right:20px !important;}
    .h1{font-size:23px !important;}
  }
  @media (prefers-color-scheme:dark){
    /* Same reasoning as the enquiry template: clients that honour this still
       render the card light, and forcing a dark palette reads badly in Gmail. */
    body,.bg{background:#dfe5ee !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${TINT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>

<table role="presentation" class="bg" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${TINT};">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;border-collapse:collapse;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden;">
${body}
      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}

/** The reference number, set apart so it is the thing you see first. */
function referenceBlock(applicationNumber: string, caption: string): string {
  return `
        <tr>
          <td class="pad" style="padding:26px 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${TINT};border:1px solid ${LINE};border-left:3px solid ${BLUE};border-radius:0 10px 10px 0;">
              <tr>
                <td style="padding:20px 22px;">
                  <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${INK_3};padding-bottom:8px;">Reference number</div>
                  <div style="font-family:Consolas,Menlo,Monaco,'Courier New',monospace;font-size:22px;font-weight:700;letter-spacing:0.5px;color:${INK};">${esc(applicationNumber)}</div>
                  <div style="font-family:${FONT};font-size:13px;line-height:1.6;color:${INK_2};padding-top:8px;">${esc(caption)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

/**
 * Internal notification. Carries every contact detail the recruiter needs so
 * they can act from the inbox, and links into the dashboard for the rest.
 */
export function renderApplicationNotification(
  input: ApplicationEmailInput,
  opts: { now?: Date } = {},
): Rendered {
  const stamp = formatStamp(opts.now ?? new Date());
  const subject = `New Application — ${input.jobTitle} | ${input.candidateName}`;

  const dashboardUrl = escUrl(`${origin()}/app/recruiting/applications/${input.applicationId}`);
  const replySubject = encodeURIComponent(
    `Your application to Consult America — ${input.jobTitle} (${input.applicationNumber})`,
  );
  const mailtoHref = `mailto:${escUrl(input.candidateEmail)}?subject=${replySubject}`;

  const tel = input.candidatePhone ? telHref(input.candidatePhone) : "";
  const phoneHtml = input.candidatePhone
    ? tel
      ? link(escUrl(tel), input.candidatePhone)
      : esc(input.candidatePhone)
    : `<span style="color:${INK_3};font-weight:500;">Not provided</span>`;

  const body = `
${header("New application")}
        <!-- title -->
        <tr>
          <td class="pad" style="padding:34px 32px 0;">
            <h1 class="h1" style="margin:0;font-family:${FONT};font-size:27px;line-height:1.25;font-weight:700;color:${INK};letter-spacing:-0.5px;">New Application</h1>
            <p style="margin:12px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK_2};">
              <strong style="color:${INK};">${esc(input.candidateName)}</strong> applied for
              <strong style="color:${BLUE};">${esc(input.jobTitle)}</strong>.
            </p>
            <p style="margin:10px 0 0;font-family:${FONT};font-size:13px;color:${INK_3};">Submitted ${esc(stamp)}</p>
          </td>
        </tr>
${button(dashboardUrl, "View in dashboard")}
        <!-- details -->
        <tr>
          <td class="pad" style="padding:28px 32px 0;">
            <div style="border-top:1px solid ${LINE};"></div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              ${row(field("Candidate", esc(input.candidateName)), field("Email", link(mailtoHref, input.candidateEmail)))}
              ${row(field("Phone", phoneHtml), field("Role", `<span style="display:inline-block;background:${TINT};border:1px solid ${LINE};border-radius:6px;padding:4px 10px;font-size:14px;color:${INK};">${esc(input.jobTitle)}</span>`))}
              ${row(field("Reference", esc(input.applicationNumber)), field("Source", `<span style="font-weight:500;color:${INK_2};">${esc(input.source || "Careers Site")}</span>`))}
            </table>
            <div style="border-top:1px solid ${LINE};"></div>
          </td>
        </tr>

        <!-- spacer before the footer -->
        <tr><td style="height:28px;line-height:28px;font-size:0;">&nbsp;</td></tr>
${footer("Reply-to is set to<br />the candidate&rsquo;s address")}`;

  const html = shell(
    subject,
    `${input.candidateName} applied for ${input.jobTitle} — reference ${input.applicationNumber}.`,
    body,
  );

  const text = [
    "NEW APPLICATION",
    "",
    `${input.candidateName} applied for ${input.jobTitle}.`,
    `Submitted ${stamp}`,
    "",
    "----------------------------------------",
    `Candidate: ${input.candidateName}`,
    `Email:     ${input.candidateEmail}`,
    `Phone:     ${input.candidatePhone || "Not provided"}`,
    `Role:      ${input.jobTitle}`,
    `Reference: ${input.applicationNumber}`,
    `Source:    ${input.source || "Careers Site"}`,
    "----------------------------------------",
    "",
    `View in dashboard: ${origin()}/app/recruiting/applications/${input.applicationId}`,
    "",
    `Reply directly to ${input.candidateEmail}.`,
    "",
    "Consult America — consultamerica.com",
  ].join("\n");

  return { subject, html, text };
}

/**
 * Candidate confirmation. Deliberately makes no commitment the business has
 * not made: no response time, no interview, no outcome. It confirms what was
 * received and gives them the reference number to quote.
 */
export function renderApplicationConfirmation(
  input: ApplicationEmailInput,
  opts: { now?: Date } = {},
): Rendered {
  const stamp = formatStamp(opts.now ?? new Date());
  const subject = `We received your application — ${input.jobTitle}`;

  const nextSteps = [
    "Your application is with our recruiting team for review.",
    "Any update about this application will come by email or phone, using the details you gave us.",
    "Keep the reference number above to hand, and quote it if you get in touch about this application.",
  ];

  const stepsHtml = nextSteps
    .map(
      (step) => `
                  <tr>
                    <td style="padding:0 10px 0 0;vertical-align:top;font-family:${FONT};font-size:15px;line-height:1.7;color:${BLUE};font-weight:700;">&bull;</td>
                    <td style="padding:0 0 10px;font-family:${FONT};font-size:15px;line-height:1.7;color:${INK_2};">${esc(step)}</td>
                  </tr>`,
    )
    .join("");

  const body = `
${header("Application received")}
        <!-- title -->
        <tr>
          <td class="pad" style="padding:34px 32px 0;">
            <h1 class="h1" style="margin:0;font-family:${FONT};font-size:27px;line-height:1.25;font-weight:700;color:${INK};letter-spacing:-0.5px;">We received your application</h1>
            <p style="margin:16px 0 0;font-family:${FONT};font-size:15px;line-height:1.7;color:${INK_2};">
              Hi ${esc(firstName(input.candidateName))}, thank you for applying to Consult America. Your application for
              <strong style="color:${INK};">${esc(input.jobTitle)}</strong> is in.
            </p>
            <p style="margin:10px 0 0;font-family:${FONT};font-size:13px;color:${INK_3};">Received ${esc(stamp)}</p>
          </td>
        </tr>
${referenceBlock(input.applicationNumber, "Quote this number in any correspondence about your application.")}
        <!-- what happens next -->
        <tr>
          <td class="pad" style="padding:26px 32px 0;">
            <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${INK_3};padding-bottom:12px;">What happens next</div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              ${stepsHtml}
            </table>
          </td>
        </tr>
${button(`${SITE}/careers`, "See our open roles")}
        <!-- spacer before the footer -->
        <tr><td style="height:30px;line-height:30px;font-size:0;">&nbsp;</td></tr>
${footer("Questions? Reply to<br />this email.")}`;

  const html = shell(
    subject,
    `Your application for ${input.jobTitle} is in. Reference ${input.applicationNumber}.`,
    body,
  );

  const text = [
    "WE RECEIVED YOUR APPLICATION",
    "",
    `Hi ${firstName(input.candidateName)}, thank you for applying to Consult America.`,
    `Your application for ${input.jobTitle} is in.`,
    `Received ${stamp}`,
    "",
    `REFERENCE NUMBER: ${input.applicationNumber}`,
    "Quote this number in any correspondence about your application.",
    "",
    "WHAT HAPPENS NEXT",
    ...nextSteps.map((step) => `- ${step}`),
    "",
    `See our open roles: ${SITE}/careers`,
    "",
    "Consult America — consultamerica.com",
  ].join("\n");

  return { subject, html, text };
}

/** One Resend send. Returns whether it was accepted; never throws. */
async function post(
  apiKey: string,
  label: "notification" | "confirmation",
  payload: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("[application-email] resend failed", label, res.status, await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[application-email] resend request failed", label, error);
    return false;
  }
}

/**
 * Sends both emails. Independent on purpose: a rejected candidate address must
 * not stop the recruiting inbox being told, and vice versa. The returned flags
 * are what was actually accepted by Resend, so a caller never logs a send that
 * did not happen.
 */
export async function sendApplicationEmails(
  input: ApplicationEmailInput,
): Promise<{ notified: boolean; confirmed: boolean }> {
  const notification = renderApplicationNotification(input);
  const confirmation = renderApplicationConfirmation(input);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Same degradation as app/api/contact/route.ts: log enough to follow up by
    // hand, and report honestly that nothing was sent.
    console.warn(
      `[application-email] RESEND_API_KEY not set — nothing sent.\n` +
        `Notification: ${notification.subject}\nConfirmation: ${confirmation.subject}\n${notification.text}`,
    );
    return { notified: false, confirmed: false };
  }

  const from = process.env.CONTACT_FROM || DEFAULT_FROM;
  const recruitingInbox = process.env.RECRUITING_TO || CONTACT.recruiting;

  const [notified, confirmed] = await Promise.all([
    post(apiKey, "notification", {
      from,
      to: [recruitingInbox],
      // Hitting reply in the recruiting inbox should reach the candidate.
      reply_to: input.candidateEmail,
      subject: notification.subject,
      html: notification.html,
      text: notification.text,
    }),
    post(apiKey, "confirmation", {
      from,
      to: [input.candidateEmail],
      // A candidate replying to the confirmation should reach recruiting.
      reply_to: recruitingInbox,
      subject: confirmation.subject,
      html: confirmation.html,
      text: confirmation.text,
    }),
  ]);

  return { notified, confirmed };
}
