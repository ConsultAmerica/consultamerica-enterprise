/**
 * Transactional email for the Neon-backed admin area: today just the password
 * reset link.
 *
 * Built the same way as lib/email/enquiry-template.ts and
 * lib/email/application-emails.ts — nested tables, inline styles, one <style>
 * block carrying only a mobile media query, an absolute https logo — because
 * that is what Outlook's Word renderer supports and because every Consult
 * America email should read as one system. The palette and the small render
 * helpers are imported from enquiry-template.ts rather than copied, so a change
 * to the brand colours reaches this file too.
 *
 * Rendering is pure: renderAdminPasswordResetEmail touches no network and can
 * be exercised without a mail provider. Only sendAdminPasswordResetEmail talks
 * to Resend, and it reports what was actually accepted rather than assuming.
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
  formatStamp,
  link,
} from "@/lib/email/enquiry-template";

const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const DEFAULT_FROM = "Consult America <onboarding@resend.dev>";

export type AdminPasswordResetEmailInput = {
  /** Where the link goes. Address comes from the database, never from the form. */
  to: string;
  fullName: string;
  /** Absolute https URL including the one-time token. */
  resetUrl: string;
  /** When the link stops working, rendered so the reader can see the deadline. */
  expiresAt: Date;
  now?: Date;
};

type Rendered = { subject: string; html: string; text: string };

/** First name for the greeting; never blank. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
}

export function renderAdminPasswordResetEmail(input: AdminPasswordResetEmailInput): Rendered {
  const now = input.now ?? new Date();
  const subject = "Reset your Consult America admin password";
  const href = escUrl(input.resetUrl);
  const expiry = formatStamp(input.expiresAt);
  const greeting = firstName(input.fullName);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${esc(subject)}</title>
<style>
  @media only screen and (max-width:600px){
    .pad{padding-left:20px !important;padding-right:20px !important;}
    .h1{font-size:23px !important;}
  }
  @media (prefers-color-scheme:dark){
    /* Same decision as the enquiry template: keep the card light. Forcing a
       dark palette here produces unreadable mixes in Gmail. */
    body,.bg{background:#dfe5ee !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${TINT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Use this link within the hour to choose a new admin password.</div>

<table role="presentation" class="bg" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${TINT};">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;border-collapse:collapse;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden;">

        <!-- header -->
        <tr>
          <td style="background:${NAVY};padding:26px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="vertical-align:middle;width:42px;">
                  <img src="${LOGO}" width="38" height="38" alt="Consult America" style="display:block;width:38px;height:38px;border:0;border-radius:50%;" />
                </td>
                <td style="vertical-align:middle;padding-left:12px;">
                  <div style="font-family:${FONT};font-size:17px;font-weight:700;color:#ffffff;letter-spacing:-0.2px;line-height:1.2;">Consult America</div>
                  <div style="font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#6ea8f0;padding-top:2px;">Recruitment admin</div>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="display:inline-block;font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#9fc4f5;background:${NAVY_2};border:1px solid #2b3d5e;border-radius:999px;padding:6px 12px;">Password reset</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- title -->
        <tr>
          <td class="pad" style="padding:34px 32px 0;">
            <h1 class="h1" style="margin:0;font-family:${FONT};font-size:27px;line-height:1.25;font-weight:700;color:${INK};letter-spacing:-0.5px;">Reset your password</h1>
            <p style="margin:12px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK_2};">
              Hello ${esc(greeting)} &mdash; someone asked to reset the password for your Consult America admin account. Choose a new one here.
            </p>
          </td>
        </tr>

        <!-- button -->
        <tr>
          <td class="pad" style="padding:24px 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
              <tr>
                <td style="background:${BLUE};border-radius:999px;">
                  <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Choose a new password &rarr;</a>
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${INK_3};">
              This link can be used once and stops working ${esc(expiry)}. If the button does not open, copy this address into your browser:<br />
              <span style="word-break:break-all;color:${INK_2};">${esc(input.resetUrl)}</span>
            </p>
          </td>
        </tr>

        <!-- did not request -->
        <tr>
          <td class="pad" style="padding:26px 32px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${TINT};border:1px solid ${LINE};border-left:3px solid ${BLUE};border-radius:0 10px 10px 0;">
              <tr>
                <td style="padding:20px 22px;">
                  <div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${INK_3};padding-bottom:10px;">Didn&rsquo;t ask for this?</div>
                  <div style="font-family:${FONT};font-size:15px;line-height:1.7;color:${INK};">
                    Then no action is needed &mdash; your current password still works and this link will expire on its own. If you keep receiving these, tell ${link(`mailto:${escUrl(CONTACT.email)}`, CONTACT.email)}.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td style="background:${TINT};border-top:1px solid ${LINE};padding:22px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="font-family:${FONT};font-size:12px;line-height:1.6;color:${INK_3};">
                  Sent automatically by <strong style="color:${INK_2};">Consult America</strong><br />
                  <a href="${SITE}" style="color:${BLUE};text-decoration:none;">consultamerica.com</a>
                </td>
                <td align="right" style="font-family:${FONT};font-size:12px;line-height:1.6;color:${INK_3};">
                  Requested ${esc(formatStamp(now))}
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    "RESET YOUR CONSULT AMERICA ADMIN PASSWORD",
    "",
    `Hello ${greeting},`,
    "",
    "Someone asked to reset the password for your Consult America admin account.",
    "Open this link to choose a new one:",
    "",
    input.resetUrl,
    "",
    `The link can be used once and stops working ${expiry}.`,
    "",
    "DIDN'T ASK FOR THIS?",
    "No action is needed. Your current password still works and the link will",
    `expire on its own. If these keep arriving, tell ${CONTACT.email}.`,
    "",
    `Requested ${formatStamp(now)}`,
    "",
    "Consult America - consultamerica.com",
  ].join("\n");

  return { subject, html, text };
}

/**
 * Origin for the link. Falls back to the public site rather than localhost,
 * for the same reason as lib/email/application-emails.ts: a missing env var in
 * production should still produce a link that reaches the real app instead of
 * one that is dead in every inbox.
 */
export function adminEmailOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || SITE;
  return raw.replace(/\/+$/, "");
}

/**
 * Sends the reset email. Returns whether Resend accepted it; never throws, so
 * a mail outage cannot turn the forgot-password form into a 500 that tells an
 * attacker the address was real.
 *
 * DEGRADATION WITHOUT RESEND_API_KEY DIFFERS FROM THE OTHER TEMPLATES ON
 * PURPOSE. app/api/contact/route.ts and application-emails.ts log the whole
 * message body when no provider is configured, so an enquiry is never silently
 * dropped. Doing that here would write a live credential into the log stream:
 * the reset URL contains the one-time token, and anyone who can read logs could
 * then take over an admin account. So this logs that a send was skipped and for
 * which account id, and nothing else. Recovery without email is by
 * `scripts/create-admin.ts` (for a new account) or by an operator setting
 * must_change_password on the existing row.
 */
export async function sendAdminPasswordResetEmail(
  input: AdminPasswordResetEmailInput & { adminUserId: string },
): Promise<boolean> {
  const { subject, html, text } = renderAdminPasswordResetEmail(input);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(
      JSON.stringify({
        level: "error",
        context: "admin-email/password-reset",
        event: "send-skipped",
        reason: "RESEND_API_KEY not set",
        adminUserId: input.adminUserId,
        at: new Date().toISOString(),
      }),
    );
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM || DEFAULT_FROM,
        to: [input.to],
        // A reply should reach a human at Consult America, not the no-reply sender.
        reply_to: CONTACT.email,
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      // res.text() can contain the request echo, so it is not logged here —
      // only the status, which is all that is actionable anyway.
      console.error(
        JSON.stringify({
          level: "error",
          context: "admin-email/password-reset",
          event: "resend-rejected",
          status: res.status,
          adminUserId: input.adminUserId,
          at: new Date().toISOString(),
        }),
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        context: "admin-email/password-reset",
        event: "resend-request-failed",
        message: error instanceof Error ? error.message : "unknown",
        adminUserId: input.adminUserId,
        at: new Date().toISOString(),
      }),
    );
    return false;
  }
}
