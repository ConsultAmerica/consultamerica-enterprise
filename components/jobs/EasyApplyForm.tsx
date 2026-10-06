"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import type { Job } from "@/lib/jobs";
import {
  submitJobApplication,
  type SubmitJobApplicationInput,
} from "@/lib/recruiting/actions";

const STEPS = [
  { id: 1, label: "01 Your information" },
  { id: 2, label: "02 Resume" },
  { id: 3, label: "03 Questions" },
  { id: 4, label: "04 Review" },
  { id: 5, label: "05 Confirmation" },
] as const;

const WORK_AUTH_OPTIONS = [
  "Authorized to work in the U.S.",
  "Requires sponsorship now",
  "Will require sponsorship in the future",
  "Not applicable / Other",
] as const;

type EasyApplyFormProps = {
  job: Job;
};

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  yearsOfExperience: string;
  workAuthorization: string;
  coverLetter: string;
};

const INITIAL: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  location: "",
  linkedinUrl: "",
  yearsOfExperience: "",
  workAuthorization: "",
  coverLetter: "",
};

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function EasyApplyForm({ job }: EasyApplyFormProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [fullName, setFullName] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    applicationNumber: string;
  } | null>(null);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const reviewRows = useMemo(
    () => [
      ["Name", `${form.firstName} ${form.lastName}`.trim()],
      ["Email", form.email],
      ["Phone", form.phone || "—"],
      ["Location", form.location || "—"],
      ["LinkedIn", form.linkedinUrl || "—"],
      ["Resume", resume?.name ?? "—"],
      ["Work authorization", form.workAuthorization || "—"],
      ["Years of experience", form.yearsOfExperience || "—"],
      ["Cover letter", form.coverLetter.trim() ? "Included" : "—"],
    ],
    [form, resume],
  );

  const validateStep = (current: number): string | null => {
    if (current === 1) {
      const { firstName, lastName } = form.firstName
        ? { firstName: form.firstName, lastName: form.lastName }
        : splitName(fullName);
      if (!firstName.trim() || !lastName.trim()) {
        return "Please enter your first and last name.";
      }
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        return "Please enter a valid email address.";
      }
      if (!form.phone.trim()) return "Please enter a phone number.";
      if (!form.location.trim()) return "Please enter your location.";
      return null;
    }
    if (current === 2) {
      if (!resume) return "Please upload your resume (PDF, DOC, or DOCX).";
      const name = resume.name.toLowerCase();
      const ok =
        name.endsWith(".pdf") ||
        name.endsWith(".doc") ||
        name.endsWith(".docx") ||
        resume.type === "application/pdf" ||
        resume.type === "application/msword" ||
        resume.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      if (!ok) return "Resume must be a PDF, DOC, or DOCX file.";
      if (resume.size > 10 * 1024 * 1024) return "Resume must be 10 MB or smaller.";
      return null;
    }
    if (current === 3) {
      if (!form.workAuthorization) return "Please select your work authorization status.";
      if (!form.yearsOfExperience.trim()) return "Please enter your years of experience.";
      return null;
    }
    return null;
  };

  const goNext = () => {
    setError(null);
    if (step === 1) {
      const split = splitName(fullName);
      setForm((prev) => ({ ...prev, ...split }));
      if (!split.firstName.trim() || !split.lastName.trim()) {
        setError("Please enter your first and last name.");
        return;
      }
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        setError("Please enter a valid email address.");
        return;
      }
      if (!form.phone.trim()) {
        setError("Please enter a phone number.");
        return;
      }
      if (!form.location.trim()) {
        setError("Please enter your location.");
        return;
      }
    } else {
      const message = validateStep(step);
      if (message) {
        setError(message);
        return;
      }
    }
    setStep((prev) => Math.min(prev + 1, 5));
  };

  const goBack = () => {
    setError(null);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const message = validateStep(3);
    if (message) {
      setError(message);
      setStep(3);
      return;
    }
    if (!resume) {
      setError("Please upload your resume (PDF, DOC, or DOCX).");
      setStep(2);
      return;
    }

    setSubmitting(true);
    try {
      const names = form.firstName ? form : { ...form, ...splitName(fullName) };
      const input: SubmitJobApplicationInput = {
        requisitionId: job.requisitionId || job.id,
        postingId: job.id,
        firstName: names.firstName.trim(),
        lastName: names.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        location: form.location.trim(),
        linkedinUrl: form.linkedinUrl.trim() || undefined,
        yearsOfExperience: form.yearsOfExperience.trim(),
        workAuthorization: form.workAuthorization,
        coverLetter: form.coverLetter.trim() || undefined,
        resumeFileName: resume.name,
      };
      const resumeData = new FormData();
      resumeData.set("resume", resume);
      const result = await submitJobApplication(input, resumeData);
      setConfirmation({ applicationNumber: result.applicationNumber });
      setStep(5);
    } catch (err) {
      const text =
        err instanceof Error && err.message
          ? err.message
          : "We could not submit your application. Please try again.";
      setError(text);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="apply-shell">
      <p style={{ fontSize: 13.5, color: "var(--ink-3)", marginBottom: 8 }}>
        <Link href={`/jobs/${job.slug}`} style={{ color: "var(--blue)" }}>
          ← {job.title}
        </Link>
      </p>
      <h1 className="job-detail-title">Easy Apply</h1>
      <p className="job-detail-meta">
        {job.company} · {job.location} · {job.employmentType}
      </p>

      <div className="apply-steps" aria-label="Application steps">
        {STEPS.map((item) => (
          <span key={item.id} className={step === item.id ? "on" : undefined}>
            {item.label}
          </span>
        ))}
      </div>

      {step === 5 && confirmation ? (
        <div>
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>Application received</h2>
          <p style={{ color: "var(--ink-2)", lineHeight: 1.65 }}>
            Thank you for applying to <strong>{job.title}</strong>. Your application
            number is <strong>{confirmation.applicationNumber}</strong>. Our recruiting
            team will follow up by email.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
            <Link href="/jobs" className="btn btn-primary">
              Browse more jobs
            </Link>
            <Link href={`/jobs/${job.slug}`} className="btn btn-dark">
              Back to role
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={step === 4 ? onSubmit : (event) => event.preventDefault()}>
          {step === 1 ? (
            <>
              <div className="apply-field">
                <label htmlFor="fullName">Full name</label>
                <input
                  id="fullName"
                  name="fullName"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => {
                    setFullName(event.target.value);
                    const split = splitName(event.target.value);
                    setForm((prev) => ({ ...prev, ...split }));
                  }}
                  required
                />
              </div>
              <div className="apply-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => setField("email", event.target.value)}
                  required
                />
              </div>
              <div className="apply-field">
                <label htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(event) => setField("phone", event.target.value)}
                  required
                />
              </div>
              <div className="apply-field">
                <label htmlFor="location">Location</label>
                <input
                  id="location"
                  name="location"
                  autoComplete="address-level2"
                  placeholder="City, State"
                  value={form.location}
                  onChange={(event) => setField("location", event.target.value)}
                  required
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
                  onChange={(event) => setField("linkedinUrl", event.target.value)}
                />
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <div className="apply-field">
              <label htmlFor="resume">Resume</label>
              <input
                id="resume"
                name="resume"
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setResume(file);
                }}
              />
              <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
                PDF, DOC, or DOCX · max 10 MB
                {resume ? ` · Selected: ${resume.name}` : ""}
              </p>
            </div>
          ) : null}

          {step === 3 ? (
            <>
              <div className="apply-field">
                <label htmlFor="workAuthorization">Work authorization</label>
                <select
                  id="workAuthorization"
                  name="workAuthorization"
                  value={form.workAuthorization}
                  onChange={(event) => setField("workAuthorization", event.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {WORK_AUTH_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="apply-field">
                <label htmlFor="yearsOfExperience">Years of experience</label>
                <input
                  id="yearsOfExperience"
                  name="yearsOfExperience"
                  inputMode="numeric"
                  placeholder="e.g. 5"
                  value={form.yearsOfExperience}
                  onChange={(event) => setField("yearsOfExperience", event.target.value)}
                  required
                />
              </div>
              <div className="apply-field">
                <label htmlFor="coverLetter">Cover letter (optional)</label>
                <textarea
                  id="coverLetter"
                  name="coverLetter"
                  rows={6}
                  value={form.coverLetter}
                  onChange={(event) => setField("coverLetter", event.target.value)}
                />
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <div className="job-section" style={{ marginTop: 0 }}>
              <h2>Review your application</h2>
              <dl style={{ display: "grid", gap: 12, marginTop: 8 }}>
                {reviewRows.map(([label, value]) => (
                  <div key={label}>
                    <dt style={{ fontSize: 12.5, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                      {label}
                    </dt>
                    <dd style={{ fontSize: 15, color: "var(--ink)", marginTop: 4 }}>{value}</dd>
                  </div>
                ))}
              </dl>
              {form.coverLetter.trim() ? (
                <p style={{ marginTop: 16, whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>
                  {form.coverLetter}
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="apply-error">{error}</p> : null}

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
            {step > 1 ? (
              <button type="button" className="btn btn-dark" onClick={goBack} disabled={submitting}>
                Back
              </button>
            ) : (
              <Link href={`/jobs/${job.slug}`} className="btn btn-dark">
                Cancel
              </Link>
            )}
            {step < 4 ? (
              <button type="button" className="btn btn-primary" onClick={goNext}>
                Continue
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit application"}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
