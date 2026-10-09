"use client";

/**
 * The Easy Apply form for the Neon-backed apply route.
 *
 * Markup, class names and the confirmation panel are carried over verbatim
 * from components/jobs/EasyApplyForm.tsx so the page looks and behaves exactly
 * as before. Three things differ, all of them consequences of the move:
 *
 *   - it posts to submitApplicationAction (Neon + Blob) instead of
 *     submitJobApplication (Supabase);
 *   - it takes the handful of fields it actually renders rather than the full
 *     Supabase `Job` view-model, because the Neon `jobs` row has no equivalent
 *     of careerArea, categories or verified and inventing them to satisfy a
 *     type would be worse than narrowing the prop;
 *   - client-side file rules match the server's (PDF or DOCX, 5 MB). The old
 *     copy advertised DOC and 10 MB, which the new server path refuses.
 *
 * It lives beside the route rather than in components/ because the Supabase
 * form is still in service elsewhere and the two must be able to diverge until
 * that path is retired.
 */

import Link from "next/link";
import {
  useId,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { submitApplicationAction } from "./actions";

const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/** Only what this form renders. Mapped from the Neon job row by the page. */
export type ApplyFormJob = {
  slug: string;
  title: string;
  company: string;
  location: string;
  employmentType: string;
  workplaceType: string;
  /** Public job reference (CA-2026-0001), shown in the summary card. */
  reference: string;
};

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
};

const INITIAL: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  location: "",
  linkedinUrl: "",
};

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "PDF";
  if (name.endsWith(".docx")) return "DOCX";
  return "Document";
}

/**
 * A first pass only, to save the candidate a round trip. The server re-checks
 * by reading the file's leading bytes, because nothing decided here is
 * trustworthy.
 */
function isAllowedResume(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".pdf") ||
    name.endsWith(".docx") ||
    file.type === "application/pdf" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

export function ApplyForm({ job }: { job: ApplyFormJob }) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [resume, setResume] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [jobSummaryOpen, setJobSummaryOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<{ reference: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resumeHelpId = useId();
  const resumeErrorId = useId();

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateResumeFile = (file: File | null): string | null => {
    if (!file) return "Please upload your resume (PDF or DOCX).";
    if (!isAllowedResume(file)) return "Resume must be a PDF or DOCX file.";
    if (file.size > MAX_RESUME_BYTES) return "Resume must be 5 MB or smaller.";
    return null;
  };

  const assignResume = (file: File | null) => {
    if (!file) {
      setResume(null);
      return;
    }
    const message = validateResumeFile(file);
    if (message) {
      setError(message);
      setResume(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setError(null);
    setResume(file);
  };

  const validate = (): string | null => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      return "Please enter your first and last name.";
    }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return "Please enter a valid email address.";
    }
    if (!form.phone.trim()) return "Please enter a phone number.";
    return validateResumeFile(resume);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const message = validate();
    if (message || !resume) {
      setError(message ?? "Please upload your resume (PDF or DOCX).");
      return;
    }

    const ok = window.confirm(`Submit your application for\n${job.title}?`);
    if (!ok) return;

    setSubmitting(true);
    try {
      // One FormData carries the fields and the file together: the action is a
      // single Server Action POST, so the resume never needs its own endpoint.
      const payload = new FormData();
      // The slug identifies the role. The server resolves the job from it and
      // re-checks that it is published; no client-supplied id is trusted.
      payload.set("slug", job.slug);
      payload.set("firstName", form.firstName.trim());
      payload.set("lastName", form.lastName.trim());
      payload.set("email", form.email.trim());
      payload.set("phone", form.phone.trim());
      payload.set("location", form.location.trim());
      payload.set("linkedinUrl", form.linkedinUrl.trim());
      payload.set("resume", resume);

      const result = await submitApplicationAction(payload);
      if (result.ok) {
        setConfirmation({ reference: result.reference });
      } else {
        setError(result.error);
      }
    } catch {
      // Network failure or an unexpected server fault: never echo raw details.
      setError("We couldn't complete your application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    assignResume(event.dataTransfer.files?.[0] ?? null);
  };

  const onZoneKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  };

  if (confirmation) {
    return (
      <div className="apply-page">
        <div className="wrap apply-page-inner">
          <Link href={`/jobs/${job.slug}`} className="apply-back">
            ← {job.title}
          </Link>
          <div className="apply-layout apply-layout-confirm">
            <div className="apply-panel apply-confirm">
              <p className="apply-eyebrow">Application received</p>
              <h1>Thank you for applying.</h1>
              <p className="apply-confirm-lead">
                Your application for <strong>{job.title}</strong> has been received.
              </p>
              {confirmation.reference ? (
                <dl className="apply-confirm-ref">
                  <dt>Application reference</dt>
                  <dd>{confirmation.reference}</dd>
                </dl>
              ) : null}
              <div className="apply-confirm-next">
                <h4>What happens next</h4>
                <p>
                  Our recruiting team will review your application. If your
                  background aligns with the role, the team may contact you
                  regarding next steps.
                </p>
              </div>
              <div className="apply-actions apply-actions-end">
                <Link href="/jobs" className="btn btn-primary">
                  View more jobs
                </Link>
                <Link href="/careers" className="btn btn-dark">
                  Return to Careers
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="apply-page">
      <div className="wrap apply-page-inner">
        <Link href={`/jobs/${job.slug}`} className="apply-back">
          ← {job.title}
        </Link>

        <header className="apply-intro">
          <p className="apply-eyebrow">Easy Apply</p>
          <h1 className="apply-job-title" style={{ fontSize: "clamp(26px, 3.2vw, 36px)" }}>
            {job.title}
          </h1>
          <p className="apply-job-meta">
            {job.company}
            <span aria-hidden> · </span>
            {job.location}
            <span aria-hidden> · </span>
            {job.employmentType}
            {job.workplaceType ? (
              <>
                <span aria-hidden> · </span>
                {job.workplaceType}
              </>
            ) : null}
          </p>
        </header>

        <div className="apply-mobile-summary">
          <button
            type="button"
            className="apply-mobile-summary-toggle"
            aria-expanded={jobSummaryOpen}
            onClick={() => setJobSummaryOpen((open) => !open)}
          >
            <span>Job summary</span>
            <span aria-hidden>{jobSummaryOpen ? "−" : "+"}</span>
          </button>
          {jobSummaryOpen ? <JobSummaryCard job={job} /> : null}
        </div>

        <div className="apply-layout">
          <form className="apply-panel" onSubmit={onSubmit} noValidate>
            <h2 className="apply-step-heading">Contact information</h2>
            <div className="apply-grid-2">
              <div className="apply-field">
                <label htmlFor="firstName">First name *</label>
                <input
                  id="firstName"
                  name="firstName"
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={(e) => setField("firstName", e.target.value)}
                  required
                />
              </div>
              <div className="apply-field">
                <label htmlFor="lastName">Last name *</label>
                <input
                  id="lastName"
                  name="lastName"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={(e) => setField("lastName", e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="apply-grid-2">
              <div className="apply-field">
                <label htmlFor="email">Email *</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  required
                />
              </div>
              <div className="apply-field">
                <label htmlFor="phone">Phone *</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  required
                />
              </div>
            </div>

            <h2 className="apply-step-heading" style={{ marginTop: 8 }}>
              Location
            </h2>
            <div className="apply-field">
              <label htmlFor="location">City / State</label>
              <input
                id="location"
                name="location"
                autoComplete="address-level2"
                placeholder="City, State"
                value={form.location}
                onChange={(e) => setField("location", e.target.value)}
              />
            </div>
            <div className="apply-field">
              <label htmlFor="linkedinUrl">LinkedIn (optional)</label>
              <input
                id="linkedinUrl"
                name="linkedinUrl"
                type="url"
                placeholder="https://linkedin.com/in/…"
                value={form.linkedinUrl}
                onChange={(e) => setField("linkedinUrl", e.target.value)}
              />
            </div>

            <h2 className="apply-step-heading" style={{ marginTop: 8 }}>
              Resume *
            </h2>
            <input
              ref={fileInputRef}
              id="resume"
              name="resume"
              type="file"
              className="apply-file-native"
              accept={ACCEPT}
              aria-describedby={`${resumeHelpId}${error ? ` ${resumeErrorId}` : ""}`}
              onChange={(e) => assignResume(e.target.files?.[0] ?? null)}
            />
            {!resume ? (
              <div
                className={`apply-upload${dragOver ? " is-drag" : ""}`}
                role="button"
                tabIndex={0}
                onKeyDown={onZoneKeyDown}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                aria-label="Upload your resume"
              >
                <span className="apply-upload-icon" aria-hidden>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
                    <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
                  </svg>
                </span>
                <p className="apply-upload-title">Upload your resume</p>
                <p className="apply-upload-hint">
                  Drag and drop or <span className="apply-upload-browse">Browse files</span>
                </p>
                <p id={resumeHelpId} className="apply-upload-meta">
                  PDF or DOCX · Maximum 5 MB
                </p>
              </div>
            ) : (
              <div className="apply-file-selected">
                <div className="apply-file-icon" aria-hidden>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                </div>
                <div className="apply-file-meta">
                  <p className="apply-file-name">{resume.name}</p>
                  <p className="apply-file-sub">
                    {fileKind(resume)} · {formatBytes(resume.size)}
                  </p>
                  <p className="apply-file-status">Ready to submit</p>
                </div>
                <div className="apply-file-actions">
                  <button type="button" className="apply-text-btn" onClick={() => fileInputRef.current?.click()}>
                    Change
                  </button>
                  <button
                    type="button"
                    className="apply-text-btn"
                    onClick={() => {
                      setResume(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
            <p className="apply-trust">
              Your resume supplies your professional history. Your application
              information is securely submitted to Consult America.
            </p>

            {error ? (
              <p id={resumeErrorId} className="apply-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="apply-actions">
              <Link href={`/jobs/${job.slug}`} className="btn btn-dark">
                Cancel
              </Link>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Submitting application…" : "Submit application →"}
              </button>
            </div>
          </form>

          <aside className="apply-aside" aria-label="Job summary">
            <JobSummaryCard job={job} sticky />
          </aside>
        </div>
      </div>
    </div>
  );
}

function JobSummaryCard({ job, sticky = false }: { job: ApplyFormJob; sticky?: boolean }) {
  return (
    <div className={`apply-job-card${sticky ? " is-sticky" : ""}`}>
      <p className="apply-job-card-label">Job summary</p>
      <h3>{job.title}</h3>
      <ul className="apply-job-card-meta">
        <li>{job.company}</li>
        <li>{job.location}</li>
        <li>{job.employmentType}</li>
        {job.workplaceType ? <li>{job.workplaceType}</li> : null}
        {job.reference ? <li>Job ID · {job.reference}</li> : null}
      </ul>
      <Link href={`/jobs/${job.slug}`} className="apply-job-card-link">
        View full job description →
      </Link>
    </div>
  );
}
