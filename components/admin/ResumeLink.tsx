/**
 * A link to one candidate's résumé — the only sanctioned way to open a CV in
 * the admin.
 *
 * WHY THIS IS NOT `<a href={resume_url}>`: résumés are uploaded to Vercel Blob
 * with `access: "private"` (see lib/neon/resume-storage.ts), so the stored URL
 * is not fetchable by a browser and linking it directly returns 403. Every
 * résumé link therefore points at app/admin/applications/[id]/resume/route.ts,
 * which re-checks the admin session and mints a short-lived signed URL. Having
 * one component own that rule means a new screen cannot accidentally
 * reintroduce the broken direct link.
 *
 * WHY THE PRESENCE TEST IS `resumeUrl` AND NOT `filename`: the route refuses
 * with a 404 when `applications.resume_url` is null, so gating the link on the
 * same column is what guarantees a rendered link never leads to a dead end.
 * The apply path writes url, filename and size from a single upload result
 * (app/jobs/[slug]/apply/actions.ts), so they are present or absent together —
 * but the url is the one the route actually reads.
 *
 * WHY "No resume" RATHER THAN AN EMPTY CELL: a recruiter chasing a CV has to be
 * able to tell "the candidate never attached one" from "the dashboard failed to
 * show it". A blank cell says both.
 *
 * A server component: opening a résumé is a plain navigation, so there is
 * nothing here that needs client JavaScript.
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
  /**
   * Render the size under the filename. Off in dense table cells, where a
   * second line per row costs more than it tells the reader.
   */
  showSize?: boolean;
};

/**
 * Bytes as something a recruiter can judge at a glance. Deliberately coarse:
 * the only question this answers is "is this a real document or a stub".
 */
export function formatResumeSize(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumeLink({
  applicationId,
  resumeUrl,
  filename,
  sizeBytes = null,
  showSize = true,
}: Props) {
  if (!resumeUrl) {
    return <span className="ws-muted">No resume</span>;
  }

  const size = formatResumeSize(sizeBytes);
  // The filename is sanitized at upload time but is still candidate-derived, so
  // it is interpolated as JSX text (escaped) and never trusted as a URL.
  const label = filename?.trim() || "Open resume";

  return (
    <span className="ca-resume-link">
      {/*
        A plain <a>, not next/link: this URL is a route handler that answers with
        a 302 to an external signed URL, so there is no client-side navigation to
        prefetch — and prefetching it would burn a signed URL on hover.

        target="_blank" keeps the recruiter's place in the queue. rel="noopener"
        is required with it; "noreferrer" also stops the admin URL being handed
        to the blob host as a referrer.

        No `download` attribute: a 302 to a cross-origin URL ignores it, and a
        PDF is more useful previewed in a tab than dropped in Downloads.
      */}
      <a
        href={`/admin/applications/${encodeURIComponent(applicationId)}/resume`}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${label} in a new tab`}
      >
        {label}
      </a>
      {showSize && size ? <span className="ca-resume-size">{size}</span> : null}
    </span>
  );
}
