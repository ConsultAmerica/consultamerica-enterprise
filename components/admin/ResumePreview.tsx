import { formatResumeSize } from "@/components/admin/ResumeLink";

/**
 * A candidate's résumé, readable without leaving the page.
 *
 * WHY THIS EXISTS. Reviewing an application meant clicking a filename, waiting
 * for a new tab, reading, closing it, and coming back to remember what the
 * stage control said. That is four actions and a context switch for the single
 * most common thing a recruiter does. The document now sits in the workspace
 * next to the notes and the stage control, which is the whole point of a
 * workspace.
 *
 * WHY AN IFRAME AND NOT A PDF LIBRARY. The browser already has a competent PDF
 * viewer with search, zoom and print, and shipping pdf.js to render a document
 * Chrome can render natively would add hundreds of kilobytes to an internal
 * tool for no gain. The iframe points at the same session-checked signing
 * route the link uses, so authorization is unchanged: mayOpenResume() still
 * decides, and a recruiter who may not read this CV gets the route's 403
 * inside the frame rather than a document.
 *
 * WHY THE SRC IS THE ROUTE AND NOT THE BLOB URL. Résumés are stored with
 * `access: "private"`. The stored URL is not fetchable and embedding it would
 * render a 403 page. The route mints a short-lived signed URL per request and
 * 302s to it; the frame follows the redirect exactly as a tab would.
 *
 * KNOWN LIMIT, STATED RATHER THAN HIDDEN: the signed URL lasts five minutes.
 * The frame loads once, so a long read is fine, but a reload after the link
 * expires shows the blob host's error instead of the document. "Open in a new
 * tab" is always offered next to it and always mints a fresh URL.
 *
 * A server component. Everything here is a link or an iframe; nothing needs
 * client JavaScript.
 */

type Props = {
  /** applications.id — the route is scoped to the application, not the blob. */
  applicationId: string;
  /** applications.resume_url. Read for presence only; never used as an href. */
  resumeUrl: string | null;
  /** applications.resume_filename. Candidate-derived: rendered as text, never as markup. */
  filename: string | null;
  /** applications.resume_size_bytes. */
  sizeBytes?: number | null;
};

const EXTERNAL = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.1"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

const FILE = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
);

/**
 * Whether the browser will render this inline.
 *
 * Extension, not MIME type: applications stores the filename, not the content
 * type, and uploadResume already restricts the set to PDF and DOCX. Only PDF
 * previews — no browser renders a .docx in a frame, and showing one an empty
 * grey box would be worse than telling them plainly.
 */
function isPdf(filename: string | null): boolean {
  return (filename ?? "").trim().toLowerCase().endsWith(".pdf");
}

export function ResumePreview({ applicationId, resumeUrl, filename, sizeBytes = null }: Props) {
  const href = `/admin/applications/${encodeURIComponent(applicationId)}/resume`;
  const label = filename?.trim() || "Résumé";
  const size = formatResumeSize(sizeBytes);

  /*
    No résumé at all. A recruiter chasing a CV must be able to tell "the
    candidate never attached one" from "the viewer failed to load", and a blank
    panel says both.
  */
  if (!resumeUrl) {
    return (
      <div className="rp-none">
        <span className="rp-none-icon">{FILE}</span>
        <p className="rp-none-title">No résumé on this application</p>
        <p className="rp-none-note">
          Nothing was uploaded when this application was submitted. Applications made through Easy
          Apply always carry one, so this record most likely predates that rule or was created by
          hand.
        </p>
      </div>
    );
  }

  return (
    <div className="rp">
      <div className="rp-bar">
        <span className="rp-bar-icon">{FILE}</span>
        <span className="rp-bar-text">
          <span className="rp-bar-name" title={label}>
            {label}
          </span>
          {size ? <span className="rp-bar-size">{size}</span> : null}
        </span>
        {/*
          A plain <a>, not next/link: this URL is a route handler answering with
          a 302 to an external signed URL, so there is no client navigation to
          prefetch, and prefetching would burn a signed URL on hover.
        */}
        <a className="rp-bar-open" href={href} target="_blank" rel="noopener noreferrer">
          Open in new tab {EXTERNAL}
        </a>
      </div>

      {isPdf(filename) ? (
        <iframe
          className="rp-frame"
          src={href}
          title={`Résumé: ${label}`}
          /*
            NO sandbox ATTRIBUTE, AND THAT IS DELIBERATE — it was tried first
            and it breaks the feature. Chrome will not instantiate its built-in
            PDF viewer inside a sandboxed frame; the panel renders as a grey
            box with a broken-document icon and no console error to explain it.

            Little is given up. The framed document is served from the blob
            host, a different origin, so the same-origin policy already stops
            it reading this page's DOM, cookies or session. Chrome runs any
            JavaScript inside a PDF in its own isolated process. What the
            attribute would have added over that is blocking top-level
            navigation from a link inside the document, which is the same
            exposure as opening the file in a tab, which is what a recruiter
            did before this panel existed.

            no-referrer so the blob host is never told which admin URL framed
            it; the signed URL is a bearer credential and its context is nobody
            else's business.
          */
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="rp-noframe">
          <p className="rp-noframe-title">This file cannot be previewed here</p>
          <p className="rp-noframe-note">
            Only PDFs render in the browser. Open {label} in a new tab to read it in whichever
            application handles Word documents on your machine.
          </p>
          <a className="ws-btn" href={href} target="_blank" rel="noopener noreferrer">
            Open résumé {EXTERNAL}
          </a>
        </div>
      )}
    </div>
  );
}
