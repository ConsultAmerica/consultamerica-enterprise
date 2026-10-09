/**
 * The internal notification sent when someone submits "Talk to an expert".
 *
 * Written as a table-based HTML email with inline styles, which is what Outlook
 * (Word rendering engine) actually supports — flexbox, grid and external
 * stylesheets are all unreliable there. The one <style> block only carries a
 * mobile media query that stacks the two-column grid; clients that strip it
 * still get a readable layout because the fallback is a normal table.
 *
 * The logo is an absolute https URL because email clients cannot resolve
 * relative paths, and is given explicit width/height so it does not jump while
 * images load.
 */

export type Enquiry = {
  name: string;
  email: string;
  company: string;
  phone?: string;
  interest: string;
  message: string;
};

// Palette and the small render helpers below are exported so every
// transactional email (see lib/email/application-emails.ts) is built from the
// same values and renders as one system. Behaviour is unchanged by exporting.
export const NAVY = "#0e1726";
export const NAVY_2 = "#162440";
export const BLUE = "#1d6fe0";
export const INK = "#15213a";
export const INK_2 = "#4a5a73";
export const INK_3 = "#7b8aa3";
export const LINE = "#e4eaf2";
export const TINT = "#f5f8fc";

export const SITE = "https://consultamerica.com";
export const LOGO = `${SITE}/logo-mark3.png`;

/** Escape for HTML text nodes and quoted attribute values. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape for use inside a URL (mailto/tel), then escape for the attribute. */
export function escUrl(s: string): string {
  return esc(encodeURI(s));
}

/** Digits only, so tel: links work regardless of how the number was typed. */
export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : "";
}

export function formatStamp(now: Date): string {
  // Eastern: both offices are in that zone, so the timestamp matches the
  // reader's working day rather than UTC.
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/New_York",
  }).format(now);
  return `${date} at ${time}`;
}

export function field(label: string, valueHtml: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td style="padding:0 0 4px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${INK_3};">${esc(label)}</td>
      </tr>
      <tr>
        <td style="padding:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.45;color:${INK};font-weight:600;word-break:break-word;">${valueHtml}</td>
      </tr>
    </table>`;
}

export function link(href: string, text: string): string {
  return `<a href="${href}" style="color:${BLUE};text-decoration:none;font-weight:600;">${esc(text)}</a>`;
}

/** Two cells side by side, stacking on narrow screens via the media query. */
export function row(left: string, right: string): string {
  return `
    <tr>
      <td class="col" style="padding:16px 14px 16px 0;vertical-align:top;width:50%;">${left}</td>
      <td class="col" style="padding:16px 0 16px 14px;vertical-align:top;width:50%;">${right}</td>
    </tr>`;
}

export function renderEnquiryEmail(
  e: Enquiry,
  opts: { brief?: string; now?: Date } = {},
): { subject: string; html: string; text: string } {
  const now = opts.now ?? new Date();
  const stamp = formatStamp(now);
  const subject = `New Consultation Request — ${e.company} | ${e.interest}`;

  const tel = e.phone ? telHref(e.phone) : "";
  const phoneHtml = e.phone
    ? tel
      ? link(escUrl(tel), e.phone)
      : esc(e.phone)
    : `<span style="color:${INK_3};font-weight:500;">Not provided</span>`;

  const replySubject = encodeURIComponent(`Re: your enquiry to Consult America — ${e.interest}`);
  const replyHref = `mailto:${escUrl(e.email)}?subject=${replySubject}`;

  const messageHtml = esc(e.message).replace(/\r?\n/g, "<br />");

  const briefBlock = opts.brief
    ? `
          <tr>
            <td style="padding:0 32px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px dashed ${LINE};border-radius:10px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${INK_3};padding-bottom:8px;">Internal brief</div>
                    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:${INK_2};white-space:pre-wrap;">${esc(opts.brief)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : "";

  const html = `<!doctype html>
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
    /* Clients that honour this still render the card light; forcing a dark
       palette here tends to produce unreadable mixes in Gmail. */
    body,.bg{background:#dfe5ee !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${TINT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">New consultation request from ${esc(e.name)} at ${esc(e.company)} — ${esc(e.interest)}.</div>

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
                  <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;color:#ffffff;letter-spacing:-0.2px;line-height:1.2;">Consult America</div>
                  <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#6ea8f0;padding-top:2px;">Building Innovative Future</div>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="display:inline-block;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#9fc4f5;background:${NAVY_2};border:1px solid #2b3d5e;border-radius:999px;padding:6px 12px;">New lead</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- title -->
        <tr>
          <td class="pad" style="padding:34px 32px 0;">
            <h1 class="h1" style="margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:27px;line-height:1.25;font-weight:700;color:${INK};letter-spacing:-0.5px;">New Consultation Request</h1>
            <p style="margin:12px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${INK_2};">
              <strong style="color:${INK};">${esc(e.name)}</strong> from <strong style="color:${INK};">${esc(e.company)}</strong> asked about
              <strong style="color:${BLUE};">${esc(e.interest)}</strong>.
            </p>
            <p style="margin:10px 0 0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:${INK_3};">Submitted ${esc(stamp)}</p>
          </td>
        </tr>

        <!-- reply button -->
        <tr>
          <td class="pad" style="padding:24px 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
              <tr>
                <td style="background:${BLUE};border-radius:999px;">
                  <a href="${replyHref}" style="display:inline-block;padding:13px 26px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Reply to ${esc(e.name.split(" ")[0] || "client")} &rarr;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- details -->
        <tr>
          <td class="pad" style="padding:28px 32px 0;">
            <div style="border-top:1px solid ${LINE};"></div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              ${row(field("Name", esc(e.name)), field("Email", link(`mailto:${escUrl(e.email)}`, e.email)))}
              ${row(field("Company", esc(e.company)), field("Phone", phoneHtml))}
              ${row(field("Interest", `<span style="display:inline-block;background:${TINT};border:1px solid ${LINE};border-radius:6px;padding:4px 10px;font-size:14px;color:${INK};">${esc(e.interest)}</span>`), field("Source", `<span style="font-weight:500;color:${INK_2};">Talk to an expert form</span>`))}
            </table>
            <div style="border-top:1px solid ${LINE};"></div>
          </td>
        </tr>

        <!-- message -->
        <tr>
          <td class="pad" style="padding:26px 32px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${TINT};border:1px solid ${LINE};border-left:3px solid ${BLUE};border-radius:0 10px 10px 0;">
              <tr>
                <td style="padding:20px 22px;">
                  <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${INK_3};padding-bottom:10px;">Their message</div>
                  <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:${INK};">${messageHtml}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
${briefBlock}
        <!-- footer -->
        <tr>
          <td style="background:${TINT};border-top:1px solid ${LINE};padding:22px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${INK_3};">
                  Sent automatically by <strong style="color:${INK_2};">Consult America</strong><br />
                  <a href="${SITE}" style="color:${BLUE};text-decoration:none;">consultamerica.com</a>
                </td>
                <td align="right" style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${INK_3};">
                  Reply-to is set to<br />the sender&rsquo;s address
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
    "NEW CONSULTATION REQUEST",
    "",
    `${e.name} from ${e.company} asked about ${e.interest}.`,
    `Submitted ${stamp}`,
    "",
    "----------------------------------------",
    `Name:     ${e.name}`,
    `Email:    ${e.email}`,
    `Company:  ${e.company}`,
    `Phone:    ${e.phone || "Not provided"}`,
    `Interest: ${e.interest}`,
    "Source:   Talk to an expert form",
    "----------------------------------------",
    "",
    "THEIR MESSAGE",
    e.message,
    ...(opts.brief ? ["", "INTERNAL BRIEF", opts.brief] : []),
    "",
    `Reply directly to ${e.email}.`,
    "",
    "Consult America — consultamerica.com",
  ].join("\n");

  return { subject, html, text };
}
