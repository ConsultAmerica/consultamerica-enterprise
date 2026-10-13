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
import { currentDatabaseName, isProductionDatabase, neonTableUrl } from "@/lib/neon/console-link";
import type { ApplicationMethod } from "@/lib/neon/types";
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
  /** Original filename of the uploaded CV, shown on the internal notification. */
  resumeFilename?: string | null;
  /**
   * The résumé itself, base64, attached to the recruiting notification.
   *
   * WHY ATTACH IT. The notification links to the dashboard, and the dashboard
   * needs a signed-in session, so reading a CV from a phone meant logging into
   * the admin first. A recruiting inbox should be able to open the document it
   * is being told about. The link stays as well: it is the only way to reach
   * the live record, and an attachment is a snapshot of one moment.
   *
   * Only ever on the notification to the internal inbox. The candidate is not
   * sent their own CV back, which tells them nothing and doubles the bytes.
   */
  resumeAttachment?: { filename: string; contentBase64: string } | null;
  /** City/State as typed. Easy Apply collects it, so the recruiter should see it. */
  candidateLocation?: string | null;
  /** LinkedIn profile, optional on the form. */
  candidateLinkedIn?: string | null;
  /**
   * Which route filed this application.
   *
   * WHY IT IS ON THE NOTIFICATION AND NOT JUST IN THE DASHBOARD. There are now
   * two ways in and they produce different things to act on: a form submission
   * is a résumé to read, while an AI interview submission has a scored
   * conversation arriving a few minutes later. A recruiter triaging from their
   * phone has to know which one they are looking at, because the right next
   * step for the second is "wait for the score", and an inbox that renders
   * both identically makes them open the dashboard to find out.
   *
   * Defaults to the form, which is what every caller that predates the AI
   * route means.
   */
  method?: ApplicationMethod;
};

/**
 * Method labels, for the internal notification only.
 *
 * Deliberately not the raw enum. "AI_INTERVIEW" in an email reads as a leaked
 * database value; the point of the row is to be read at a glance.
 */
const METHOD_LABELS: Record<ApplicationMethod, string> = {
  EASY_APPLY: "Easy Apply form",
  AI_INTERVIEW: "AI interview",
};

export function applicationMethodLabel(method: ApplicationMethod | undefined): string {
  return METHOD_LABELS[method ?? "EASY_APPLY"];
}

export type Rendered = { subject: string; html: string; text: string };

export const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const DEFAULT_FROM = "Consult America <onboarding@resend.dev>";

/**
 * Origin for links inside emails. Falls back to the public site rather than
 * localhost: a missing env var in production should still produce a link that
 * reaches the real dashboard, not one that is dead in every inbox.
 */
export function origin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || SITE;
  return raw.replace(/\/+$/, "");
}

/** First name for a greeting; falls back to something neutral, never blank. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
}

/**
 * Shared chrome so every email in this system carries the identical header.
 *
 * Exported, along with shell/button/footer/origin below, because
 * lib/email/interview-emails.ts renders two more messages about the same
 * application and they have to look like the same product. Rebuilding this
 * markup there would mean two copies of the Outlook-safe table layout to keep
 * in step, and the first divergence nobody notices is the one that ships.
 */
export function header(pill: string): string {
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

export function button(href: string, label: string): string {
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

/**
 * The database the Neon link points at, written the way a reader needs it.
 *
 * Production is named out loud, not left to be inferred from the database name,
 * because the two databases look identical once the console is open and the
 * mistake worth preventing is somebody reading or editing live candidate data
 * believing it was the local copy.
 *
 * One label for both the HTML and the text body so the two cannot drift, and
 * worded as a fragment that reads correctly in either: "database neondb,
 * production data". Returns null when the connection string cannot be read,
 * which is what suppresses the link.
 */
function neonDatabaseLabel(): string | null {
  const database = currentDatabaseName();
  if (!database) return null;
  return isProductionDatabase() ? `database ${database}, production data` : `database ${database}`;
}

/*
  INTERNAL RECIPIENTS ONLY.

  Both helpers below are named `internal*` because that is the only condition
  that makes them safe, and a name is the part of a constraint that survives
  being copied into a new template. They may only be called from a message
  whose recipient is the recruiting inbox:

    sendRecruitingNotification        to: [RECRUITING_TO || CONTACT.recruiting]
    sendInterviewCompletedNotification to: [recruitingInbox()]

  and never from the two candidate-facing messages in this system, which send
  to [input.candidateEmail]:

    sendApplicationEmails, the confirmation half
    sendSecondRoundInvitation

  A candidate has no business being shown our infrastructure, and the id of
  their own record is not something to hand out with a console link beside it.

  NO SQL IN AN EMAIL. An earlier draft of this carried the lookup statement as
  copyable text. It came out, because these messages carry candidate details to
  a recruiting inbox and a SELECT in the body makes a hiring notification read
  like a debug artefact to the people whose actual job it is. The copy control
  belongs in the admin dashboard, behind a sign-in, where a developer already
  is when they need it.
*/

/**
 * The quiet Neon console link that sits under the primary button.
 *
 * WHY IT IS SMALL PRINT AND NOT A SECOND BUTTON. The link a recruiter should
 * press is the dashboard: it is the only view that renders an application the
 * way the business reads it, and the only one that works without a Neon
 * account. This line is an escape hatch for whoever is debugging why a record
 * looks wrong. Rendered as a second pill it would offer the inbox two
 * equal-looking choices and walk recruiters into a database console they have
 * no reason to see, so it is muted, 12px, and visually attached to the button
 * above it.
 *
 * WHY IT DOES NOT CLAIM TO OPEN THE ROW. Neon has no URL for a single record,
 * so "Open in Neon console" is the most this link can honestly promise. The
 * record id beside it is what finds the row once the reader is there, which is
 * also why the id is spelled out rather than left implicit in the dashboard
 * link above.
 *
 * WHY THE TABLE URL AND NOT THE SQL EDITOR URL. Both console parameters are
 * unverified (see lib/neon/console-link.ts), but this one is short, and a short
 * URL is the one that survives mail clients that rewrite, wrap or truncate.
 * Either way the reader lands in the right project rather than nowhere.
 *
 * WHY THE TABLE IS ALWAYS `applications`. Both notifications that carry this
 * line are about one application, and their primary button opens that
 * application in the dashboard. Pointing the escape hatch at the same record
 * keeps the two links answering the same question.
 *
 * Returns an empty string when the database cannot be determined, which omits
 * the line entirely. A console link built without knowing the database sends
 * the reader to whichever project their console happens to open, and a reader
 * who trusted it would be reading the wrong data believing it was this record.
 */
export function internalNeonLinkRow(applicationId: string): string {
  const url = neonTableUrl("applications");
  const database = neonDatabaseLabel();
  if (!url || !database) return "";

  /*
    esc and not escUrl on the href.

    escUrl runs encodeURI first, which is right for the mailto and tel links in
    this file because those are assembled from raw user input. This URL was
    built by URLSearchParams and is already percent-encoded, so encodeURI would
    escape the percent signs a second time. esc still does the part that
    matters in markup: the query separators become &amp; and nothing can close
    the attribute.
  */
  return `
        <tr>
          <td class="pad" style="padding:14px 32px 0;">
            <div style="font-family:${FONT};font-size:12px;line-height:1.7;color:${INK_3};">
              <a href="${esc(url)}" style="color:${INK_3};text-decoration:underline;font-weight:600;">Open in Neon console</a>
              <span style="color:${INK_3};">&nbsp;&middot;&nbsp;${esc(database)}</span><br />
              Record id
              <span style="font-family:Consolas,Menlo,Monaco,'Courier New',monospace;font-size:11px;color:${INK_2};">${esc(applicationId)}</span>
            </div>
          </td>
        </tr>`;
}

/**
 * The same escape hatch for the plain-text body.
 *
 * Separate from the HTML because some clients render only the text part, and a
 * developer reading the notification there needs the console URL, the database
 * and the id as much as one reading the HTML. Returns an empty array when there
 * is no database to point at, so the caller spreads nothing and no blank line
 * is left behind.
 */
export function internalNeonLinkTextLines(applicationId: string): string[] {
  const url = neonTableUrl("applications");
  const database = neonDatabaseLabel();
  if (!url || !database) return [];

  return [`Open in Neon console (${database}): ${url}`, `Record id: ${applicationId}`];
}

export function footer(note: string): string {
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
export function shell(subject: string, preheader: string, body: string): string {
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
  const methodLabel = applicationMethodLabel(input.method);
  /*
    The route is in the subject line for AI submissions only.

    An inbox sorts and searches on subjects, so "AI Interview" there is what
    lets a recruiter find or filter the ones with a score coming. Adding
    "Easy Apply" to the other subject would change the line every existing
    filter and saved search already matches, to say the thing that has always
    been true of every notification.
  */
  const subject =
    input.method === "AI_INTERVIEW"
      ? `New AI Interview Application — ${input.jobTitle} | ${input.candidateName}`
      : `New Application — ${input.jobTitle} | ${input.candidateName}`;

  const dashboardUrl = escUrl(`${origin()}/admin/applications/${input.applicationId}`);
  // Authenticated route that mints a signed URL; the blob itself is private,
  // so a raw link would 403 and the CV cannot be attached to the mail either.
  const resumeUrl = escUrl(`${origin()}/admin/applications/${input.applicationId}/resume`);
  // Every field the candidate filled in appears here. A recruiter should not
  // have to open the dashboard to see something they already typed.
  const locationHtml = input.candidateLocation
    ? esc(input.candidateLocation)
    : `<span style="color:${INK_3};font-weight:500;">Not provided</span>`;
  // Only http(s) becomes a link: this string came from a public form.
  const linkedInHtml = input.candidateLinkedIn && /^https?:\/\//i.test(input.candidateLinkedIn)
    ? link(escUrl(input.candidateLinkedIn), input.candidateLinkedIn.replace(/^https?:\/\//i, ""))
    : input.candidateLinkedIn
      ? esc(input.candidateLinkedIn)
      : `<span style="color:${INK_3};font-weight:500;">Not provided</span>`;
  const resumeHtml = input.resumeFilename
    ? link(resumeUrl, input.resumeFilename)
    : `<span style="color:${INK_3};font-weight:500;">Not provided</span>`;
  const replySubject = encodeURIComponent(
    `Your application to Consult America — ${input.jobTitle} (${input.applicationNumber})`,
  );
  const mailtoHref = `mailto:${escUrl(input.candidateEmail)}?subject=${replySubject}`;

  /*
    Safe here because this notification goes to the recruiting inbox, which
    sendRecruitingNotification below addresses as RECRUITING_TO or
    CONTACT.recruiting. It must not appear in renderApplicationConfirmation,
    which is addressed to the candidate.

    Empty on any machine where the database cannot be read from the
    environment, which is what keeps the link out of the email entirely.
  */
  const neonLines = internalNeonLinkTextLines(input.applicationId);

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
              <strong style="color:${BLUE};">${esc(input.jobTitle)}</strong>
              via <strong style="color:${INK};">${esc(methodLabel)}</strong>.
            </p>
            <p style="margin:10px 0 0;font-family:${FONT};font-size:13px;color:${INK_3};">Submitted ${esc(stamp)}</p>
            ${
              input.method === "AI_INTERVIEW"
                ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${INK_2};background:${TINT};border:1px solid ${LINE};border-radius:8px;padding:10px 12px;">
              The candidate was sent straight into the interview. Their score and report land on
              this application when they finish, and a second email announces it. If no score
              arrives, they were invited and did not complete it.
            </p>`
                : ""
            }
          </td>
        </tr>
${button(dashboardUrl, "View in dashboard")}
${internalNeonLinkRow(input.applicationId)}
        <!-- details -->
        <tr>
          <td class="pad" style="padding:28px 32px 0;">
            <div style="border-top:1px solid ${LINE};"></div>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              ${row(field("Candidate", esc(input.candidateName)), field("Email", link(mailtoHref, input.candidateEmail)))}
              ${row(field("Phone", phoneHtml), field("Role", `<span style="display:inline-block;background:${TINT};border:1px solid ${LINE};border-radius:6px;padding:4px 10px;font-size:14px;color:${INK};">${esc(input.jobTitle)}</span>`))}
              ${row(field("Reference", esc(input.applicationNumber)), field("Applied via", `<span style="font-weight:600;color:${INK};">${esc(methodLabel)}</span>`))}
              ${row(field("Source", `<span style="font-weight:500;color:${INK_2};">${esc(input.source || "Careers Site")}</span>`), field("", ""))}
              ${row(field("Location", locationHtml), field("LinkedIn", linkedInHtml))}
              ${row(field("Resume", resumeHtml), field("", ""))}
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
    input.method === "AI_INTERVIEW" ? "NEW AI INTERVIEW APPLICATION" : "NEW APPLICATION",
    "",
    `${input.candidateName} applied for ${input.jobTitle} via ${methodLabel}.`,
    `Submitted ${stamp}`,
    "",
    "----------------------------------------",
    `Candidate: ${input.candidateName}`,
    `Email:     ${input.candidateEmail}`,
    `Phone:     ${input.candidatePhone || "Not provided"}`,
    `Role:      ${input.jobTitle}`,
    `Reference: ${input.applicationNumber}`,
    `Via:       ${methodLabel}`,
    `Source:    ${input.source || "Careers Site"}`,
    `Location:  ${input.candidateLocation || "Not provided"}`,
    `LinkedIn:  ${input.candidateLinkedIn || "Not provided"}`,
    `Resume:    ${input.resumeFilename || "Not provided"}`,
    "----------------------------------------",
    "",
    `View in dashboard: ${origin()}/admin/applications/${input.applicationId}`,
    `Resume (sign-in required): ${origin()}/admin/applications/${input.applicationId}/resume`,
    // Blank line only when there is a link to separate, so a notification
    // without one does not end up with two blank lines in a row.
    ...(neonLines.length ? ["", ...neonLines] : []),
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

/**
 * The decision email, sent when an application is moved to Rejected.
 *
 * CANDIDATE-FACING, so the rules the confirmation follows apply here in full
 * and matter more: no internal identifiers, no AI score, no Neon link, nothing
 * about how the decision was reached. A score is a model's judgement of a
 * person and a candidate reading "you scored 6.2" would reasonably treat it as
 * a grade to argue with, which is also why the second-round invitation does
 * not quote one.
 *
 * SAYS ONE TRUE THING AND STOPS. It does not claim the application was read
 * closely, it does not promise to keep anyone on file, and it does not invent
 * a reason. Every one of those is a sentence a recruiting team cannot stand
 * behind for every recipient, and a rejection that over-explains invites a
 * reply asking which part applied.
 *
 * The reference number stays, because it is the one thing that lets somebody
 * ask about this specific application, and the careers link stays because
 * being turned down for one role says nothing about the next one.
 */
export function renderRejectionNotice(
  input: ApplicationEmailInput,
  opts: { now?: Date } = {},
): Rendered {
  const stamp = formatStamp(opts.now ?? new Date());
  const subject = `Update on your application: ${input.jobTitle}`;

  /*
    STRIPPED BACK ON PURPOSE. The first version carried a reference block and a
    "See our open roles" button, both lifted from the confirmation email where
    they earn their place: somebody who has just applied needs a number to quote
    and a reason to keep browsing. On a rejection the number is an admin detail
    for a record the reader no longer has a use for, and a button inviting them
    to start again lands as a sales pitch attached to a no. Three paragraphs and
    a signature is the whole message.
  */
  const body = `
${header("Application update")}
        <tr>
          <td class="pad" style="padding:34px 32px 0;">
            <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.7;color:${INK_2};">
              Hi ${esc(firstName(input.candidateName))},
            </p>
            <p style="margin:16px 0 0;font-family:${FONT};font-size:15px;line-height:1.7;color:${INK_2};">
              Thank you for your interest in the
              <strong style="color:${INK};">${esc(input.jobTitle)}</strong> position at Consult America
              and for taking the time to apply.
            </p>
            <p style="margin:16px 0 0;font-family:${FONT};font-size:15px;line-height:1.7;color:${INK_2};">
              After careful consideration, we have decided not to move forward with your
              application for this position at this time.
            </p>
            <p style="margin:16px 0 0;font-family:${FONT};font-size:15px;line-height:1.7;color:${INK_2};">
              We sincerely appreciate your interest in our company and wish you all the best in
              your professional journey.
            </p>
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

  const html = shell(
    subject,
    `An update on your application for ${input.jobTitle} at Consult America.`,
    body,
  );

  const text = [
    `Hi ${firstName(input.candidateName)},`,
    "",
    `Thank you for your interest in the ${input.jobTitle} position at Consult America`,
    "and for taking the time to apply.",
    "",
    "After careful consideration, we have decided not to move forward with your",
    "application for this position at this time.",
    "",
    "We sincerely appreciate your interest in our company and wish you all the best",
    "in your professional journey.",
    "",
    "Best regards,",
    "Talent Acquisition Team",
    "Consult America Inc.",
    "",
    stamp,
  ].join("\n");

  return { subject, html, text };
}

/** One Resend send. Returns whether it was accepted; never throws. */
async function post(
  apiKey: string,
  label: "notification" | "confirmation" | "rejection",
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
    /*
      SUCCESS IS LOGGED TOO, not just failure. Only logging failures means a
      silent log has to be read as "everything sent", which is the same shape
      as "the code never ran". Four rejections and one error line left no way
      to tell which three actually went out without inferring it.

      No recipient and no body: the address is personal data and the body is
      a decision about a person. The id is what Resend's own dashboard is
      searched by, which is the thing worth having here.
    */
    const id = await res
      .clone()
      .json()
      .then((body: { id?: string }) => body?.id ?? "no id")
      .catch(() => "unparseable response");
    console.info("[application-email] sent", label, id);
    return true;
  } catch (error) {
    console.error("[application-email] resend request failed", label, error);
    return false;
  }
}

/**
 * Send one already-rendered notification to the recruiting inbox.
 *
 * EXTRACTED SO THE AI ROUTE CAN SEND THE NOTIFICATION WITHOUT THE CONFIRMATION.
 * sendApplicationEmails deliberately sends both, which is right for Easy Apply:
 * the candidate fills in a form, gets a confirmation, and hears nothing more
 * for a while. The AI route is different, because the candidate is redirected
 * straight into a twenty-minute interview, and "we received your application"
 * arriving while they are halfway through it is noise about something they are
 * currently doing. They see the reference on screen before the redirect
 * instead.
 *
 * Both callers go through this one function so that the recruiting address, the
 * reply-to contract and the attachment handling are decided once. The previous
 * shape of this file had that logic inline in sendApplicationEmails, which
 * would have meant the second caller reimplementing all three.
 */
export async function sendRecruitingNotification(
  rendered: Rendered,
  options: {
    /** Hitting reply in the recruiting inbox should reach the candidate. */
    replyTo: string;
    resumeAttachment?: { filename: string; contentBase64: string } | null;
  },
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[application-email] RESEND_API_KEY not set — nothing sent.\n${rendered.subject}\n${rendered.text}`,
    );
    return false;
  }

  return post(apiKey, "notification", {
    from: process.env.CONTACT_FROM || DEFAULT_FROM,
    to: [process.env.RECRUITING_TO || CONTACT.recruiting],
    reply_to: options.replyTo,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    /*
      The résumé travels with the notification, so recruiting can read it
      without signing in. Omitted entirely rather than sent empty when there
      is nothing to attach: Resend rejects a zero-length attachment, and
      losing the whole notification over a missing file would be a far worse
      outcome than an email with no attachment.

      Résumés are capped at 5 MB by uploadResume and Resend accepts 40 MB, so
      the size limit cannot be reached from either apply path.
    */
    ...(options.resumeAttachment
      ? {
          attachments: [
            {
              filename: options.resumeAttachment.filename,
              content: options.resumeAttachment.contentBase64,
            },
          ],
        }
      : {}),
  });
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

  const [notified, confirmed] = await Promise.all([
    // Through the shared sender, so the AI route and this one cannot drift on
    // the recruiting address, the reply-to contract or the attachment rules.
    sendRecruitingNotification(notification, {
      replyTo: input.candidateEmail,
      resumeAttachment: input.resumeAttachment,
    }),
    post(apiKey, "confirmation", {
      from: process.env.CONTACT_FROM || DEFAULT_FROM,
      to: [input.candidateEmail],
      // A candidate replying to the confirmation should reach recruiting.
      reply_to: process.env.RECRUITING_TO || CONTACT.recruiting,
      subject: confirmation.subject,
      html: confirmation.html,
      text: confirmation.text,
    }),
  ]);

  return { notified, confirmed };
}

/**
 * Send the rejection to the candidate.
 *
 * ADDRESSED TO THE CANDIDATE, NOT THE RECRUITING INBOX, which is the whole
 * point of it and the one thing that must not regress: every other message in
 * this file that a recruiter triggers goes inward. Reply-to is recruiting, so
 * somebody answering reaches a person.
 *
 * NEVER THROWS, and the caller must not let it block the stage change. The
 * move to Rejected is already committed when this runs, and a mail provider
 * being briefly unreachable is not a reason to tell a recruiter their stage
 * change failed, because it did not. The boolean is what the caller reports.
 */
export async function sendRejectionNotice(
  input: ApplicationEmailInput,
): Promise<boolean> {
  const rendered = renderRejectionNotice(input);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[application-email] RESEND_API_KEY not set, no rejection sent.\n` +
        `${rendered.subject}\n${rendered.text}`,
    );
    return false;
  }

  return post(apiKey, "rejection", {
    from: process.env.CONTACT_FROM || DEFAULT_FROM,
    to: [input.candidateEmail],
    reply_to: process.env.RECRUITING_TO || CONTACT.recruiting,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
