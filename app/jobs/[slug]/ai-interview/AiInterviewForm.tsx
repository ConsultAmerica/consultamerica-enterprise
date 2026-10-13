"use client";

/**
 * The AI interview apply form.
 *
 * Markup, class names and layout are carried over from
 * app/jobs/[slug]/apply/ApplyForm.tsx so a candidate choosing between the two
 * buttons on a posting lands in the same product both times. Three things
 * differ, all of them consequences of what this route does:
 *
 *   - the résumé is OPTIONAL, and the upload zone says so rather than being
 *     marked required. The interview is the evidence on this route; see the
 *     note at the top of ./actions.ts for why the two routes differ here.
 *   - there is no confirmation panel. The candidate is sent onward to the
 *     interview, so the terminal state of this form is a redirect, not a page.
 *   - the submit button says what is about to happen, because a button labelled
 *     "Submit" that navigates to another domain is a surprise.
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

import { showWorkplaceType } from "@/lib/jobs/public-model";

import { startAiInterviewAction } from "./actions";

const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/** Only what this form renders. Mapped from the Neon job row by the page. */
export type AiInterviewFormJob = {
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

export function AiInterviewForm({ job }: { job: AiInterviewFormJob }) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [resume, setResume] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [jobSummaryOpen, setJobSummaryOpen] = useState(false);
  /**
   * Set once the application is filed and the browser is on its way to
   * ConsultHire. It keeps the form disabled and the message on screen through
   * the navigation, which on a slow connection is a second or two of otherwise
   * unexplained waiting after a click.
   */
  const [launching, setLaunching] = useState<{ reference: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resumeHelpId = useId();
  const resumeErrorId = useId();

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /**
   * Only ever called with a file the candidate chose, so "no file" is not an
   * error here the way it is on Easy Apply. A file of the wrong kind still is:
   * they meant to attach something and should know it did not stick.
   */
  const validateResumeFile = (file: File): string | null => {
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
    // No résumé check: it is optional on this route.
    return resume ? validateResumeFile(resume) : null;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || launching) return;
    setError(null);
    const message = validate();
    if (message) {
      setError(message);
      return;
    }

    setSubmitting(true);
    try {
      const payload = new FormData();
      // The slug identifies the role. The server resolves the job from it and
      // re-checks that it is published and has an interview; no client-supplied
      // id is trusted.
      payload.set("slug", job.slug);
      payload.set("firstName", form.firstName.trim());
      payload.set("lastName", form.lastName.trim());
      payload.set("email", form.email.trim());
      payload.set("phone", form.phone.trim());
      payload.set("location", form.location.trim());
      payload.set("linkedinUrl", form.linkedinUrl.trim());
      if (resume) payload.set("resume", resume);

      const result = await startAiInterviewAction(payload);
      if (!result.ok) {
        setError(result.error);
        setSubmitting(false);
        return;
      }

      /*
        A FULL NAVIGATION, NOT router.push.

        The launch URL is on another origin, so the Next router cannot route to
        it. window.location.assign is also the right choice for what this is: a
        handover. The candidate leaves our application form and arrives in their
        interview, and the apply form should not be sitting in the history stack
        one Back press away, half-submitted, ready to file a second application.

        `submitting` is deliberately left true. The browser is navigating away
        and re-enabling the button would offer a second click during the gap.
      */
      setLaunching({ reference: result.reference });
      window.location.assign(result.launchUrl);
    } catch {
      // Network failure or an unexpected server fault: never echo raw details.
      setError("We couldn't start your interview. Please try again.");
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

  return (
    <div className="apply-page">
      <div className="wrap apply-page-inner">
        <Link href={`/jobs/${job.slug}`} className="apply-back">
          ← {job.title}
        </Link>

        <header className="apply-intro">
          <p className="apply-eyebrow">Apply with AI Interview</p>
          <h1 className="apply-job-title" style={{ fontSize: "clamp(26px, 3.2vw, 36px)" }}>
            {job.title}
          </h1>
          <p className="apply-job-meta">
            {job.company}
            <span aria-hidden> · </span>
            {job.location}
            <span aria-hidden> · </span>
            {job.employmentType}
            {/* Dropped for a remote role whose location already says Remote, so
                this line does not read "Remote (US) · Full Time · Remote". See
                showWorkplaceType in lib/jobs/public-model.ts. */}
            {showWorkplaceType(job.location, job.workplaceType) ? (
              <>
                <span aria-hidden> · </span>
                {job.workplaceType}
              </>
            ) : null}
          </p>
        </header>

        {/* What is about to happen, before they fill anything in. A form that
            silently hands you to another site mid-application is the kind of
            surprise that gets people to abandon it. */}
        <div className="apply-panel apply-ai-brief">
          <h2 className="apply-step-heading" style={{ marginTop: 0 }}>
            How this works
          </h2>
          <ol className="jd-steps">
            <li>
              <strong>Your details first.</strong> We file your application for this role before
              the interview starts, so your answers have somewhere to go.
            </li>
            <li>
              <strong>Then the interview.</strong> About 20 minutes of questions built from this
              job description, in your browser. You can type your answers.
            </li>
            <li>
              <strong>We review both together.</strong> The recruiting team reads your interview
              alongside your application. There is no automatic rejection.
            </li>
          </ol>
          <p className="apply-trust" style={{ marginBottom: 0 }}>
            Prefer not to be interviewed by an AI?{" "}
            <Link href={`/jobs/${job.slug}/apply`}>Use Easy Apply instead</Link>. Both routes are
            reviewed by the same team.
          </p>
        </div>

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
              Resume (optional)
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
                aria-label="Upload your resume, optional"
              >
                <span className="apply-upload-icon" aria-hidden>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
                    <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
                  </svg>
                </span>
                <p className="apply-upload-title">Add your resume if you have one</p>
                <p className="apply-upload-hint">
                  Drag and drop or <span className="apply-upload-browse">Browse files</span>
                </p>
                <p id={resumeHelpId} className="apply-upload-meta">
                  PDF or DOCX · Maximum 5 MB · Not required for this route
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
              Your application information is securely submitted to Consult America. Your interview
              answers are stored with your application and read by the recruiting team.
            </p>

            {error ? (
              <p id={resumeErrorId} className="apply-error" role="alert">
                {error}
              </p>
            ) : null}

            {/* Shown during the handover, because the browser is navigating to
                another origin and the gap is otherwise unexplained. The
                reference is here so somebody whose interview fails to load
                still has the number their application was filed under. */}
            {launching ? (
              <p className="apply-launching" role="status">
                Your application is filed as <strong>{launching.reference}</strong>. Taking you to
                the interview now.
              </p>
            ) : null}

            <div className="apply-actions">
              <Link href={`/jobs/${job.slug}`} className="btn btn-dark">
                Cancel
              </Link>
              <button type="submit" className="btn btn-primary" disabled={submitting || !!launching}>
                {launching
                  ? "Opening the interview…"
                  : submitting
                    ? "Filing your application…"
                    : "Start the AI interview →"}
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

function JobSummaryCard({ job, sticky = false }: { job: AiInterviewFormJob; sticky?: boolean }) {
  return (
    <div className={`apply-job-card${sticky ? " is-sticky" : ""}`}>
      <p className="apply-job-card-label">Job summary</p>
      <h3>{job.title}</h3>
      <ul className="apply-job-card-meta">
        <li>{job.company}</li>
        <li>{job.location}</li>
        <li>{job.employmentType}</li>
        {showWorkplaceType(job.location, job.workplaceType) ? <li>{job.workplaceType}</li> : null}
        {job.reference ? <li>Job ID · {job.reference}</li> : null}
      </ul>
      <Link href={`/jobs/${job.slug}`} className="apply-job-card-link">
        View full job description →
      </Link>
    </div>
  );
}
