"use client";

import Link from "next/link";
import { useState } from "react";

import { parseResumeForPrefill, type ResumePrefill } from "@/app/actions/resume-prefill";
import { ProfileEditor, fromProfileDraft, toProfileDraft, splitList, type ProfileDraft } from "@/components/candidate/ProfileEditor";
import type { DraftPayload } from "@/lib/candidate-portal/drafts";
import type { Job } from "@/lib/jobs/public-model";
import {
  saveDetailedApplicationDraft,
  submitDetailedApplication,
  submitDetailedApplicationDraft,
  type SubmitJobApplicationInput,
} from "@/lib/recruiting/actions";

const ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const STEPS = ["Personal information", "Resume", "Your profile", "Job questions", "Review & submit"] as const;

type Contact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  portfolioUrl: string;
};

type State = Contact & ProfileDraft;

/** Server-prepared state for a signed-in candidate (see app/jobs/[slug]/apply/detailed/page.tsx). */
export type SignedInApply = {
  email: string;
  displayName: string;
  resumes: { documentId: string; fileName: string; isDefault: boolean; uploadedAt: string }[];
  draft: { id: string; revision: number; updatedAt: string } | null;
  /** True while another tab/device is mid-submission for this job. */
  inProgress?: boolean;
  initial: DraftPayload & { resumeDocumentId: string | null };
};

type ResumeChoice = { kind: "library"; documentId: string } | { kind: "upload" };

const EMPTY_PROFILE: ProfileDraft = { summary: "", skills: "", experience: [], education: [], certifications: "" };
const INITIAL: State = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  location: "",
  linkedinUrl: "",
  portfolioUrl: "",
  ...EMPTY_PROFILE,
};

function initialState(candidate: SignedInApply | null | undefined): State {
  if (!candidate) return INITIAL;
  const { contact, profile } = candidate.initial;
  return { ...contact, email: candidate.email, ...toProfileDraft(profile), portfolioUrl: contact.portfolioUrl || profile.portfolioUrl || "" };
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function DetailedApplyForm({ job, candidate }: { job: Job; candidate?: SignedInApply | null }) {
  const signedIn = Boolean(candidate);
  const [step, setStep] = useState(() => Math.min(candidate?.initial.step ?? 0, STEPS.length - 1));
  const [form, setForm] = useState<State>(() => initialState(candidate));
  const [resume, setResume] = useState<File | null>(null);
  const [library, setLibrary] = useState(candidate?.resumes ?? []);
  const [resumeChoice, setResumeChoice] = useState<ResumeChoice>(() =>
    candidate?.initial.resumeDocumentId ? { kind: "library", documentId: candidate.initial.resumeDocumentId } : { kind: "upload" },
  );
  const [draft, setDraft] = useState(candidate?.draft ?? null);
  const [draftNote, setDraftNote] = useState<{ ok: boolean; text: string } | null>(
    candidate?.draft ? { ok: true, text: `Draft restored · last saved ${timeLabel(candidate.draft.updatedAt)}` } : null,
  );
  const [saving, setSaving] = useState(false);
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const set = <K extends keyof State>(key: K, value: State[K]) => setForm((f) => ({ ...f, [key]: value }));
  const profileDraft: ProfileDraft = {
    summary: form.summary,
    skills: form.skills,
    experience: form.experience,
    education: form.education,
    certifications: form.certifications,
  };

  const applyPrefill = (p: ResumePrefill) =>
    setForm((f) => ({
      ...f,
      // Never overwrite something the candidate already typed.
      firstName: f.firstName || p.contact.firstName,
      lastName: f.lastName || p.contact.lastName,
      email: signedIn ? f.email : f.email || p.contact.email,
      phone: f.phone || p.contact.phone,
      location: f.location || p.contact.location,
      linkedinUrl: f.linkedinUrl || p.contact.linkedin,
      summary: f.summary || p.summary,
      skills: f.skills || p.skills.join(", "),
      experience: f.experience.length ? f.experience : p.experience,
      education: f.education.length ? f.education : p.education,
      certifications: f.certifications || p.certifications.join("\n"),
    }));

  const onResume = async (file: File | null) => {
    setError(null);
    setParseNote(null);
    setResume(file);
    if (!file) return;
    if (!/\.(pdf|docx?)$/i.test(file.name)) return setError("Resume must be a PDF, DOC, or DOCX file.");
    if (file.size > 10 * 1024 * 1024) return setError("Resume must be 10 MB or smaller.");
    setParsing(true);
    const data = new FormData();
    data.set("resume", file);
    try {
      const result = await parseResumeForPrefill(data);
      if (result.ok) {
        applyPrefill(result.prefill);
        setParseNote("We filled in what we could find in your resume. Please check and correct anything on the next step.");
      } else {
        setParseNote(result.error);
      }
    } catch {
      setParseNote("We couldn't read your resume automatically. You can still fill in your details.");
    }
    setParsing(false);
  };

  const hasResume = () => (resumeChoice.kind === "library" ? true : Boolean(resume));
  const resumeLabel = () =>
    resumeChoice.kind === "library"
      ? (library.find((r) => r.documentId === resumeChoice.documentId)?.fileName ?? "Selected résumé")
      : resume?.name;

  const validateStep = (index: number): string | null => {
    if (index === 0) {
      if (!form.firstName.trim() || !form.lastName.trim()) return "Please enter your first and last name.";
      if (!signedIn && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Please enter a valid email address.";
      if (!form.phone.trim()) return "Please enter a phone number.";
    }
    if (index === 1 && !hasResume()) return "Please upload your resume (PDF, DOC, or DOCX).";
    if (index === 2 && form.experience.some((e) => !e.title.trim())) return "Each experience entry needs a job title (or remove it).";
    return null;
  };

  const next = () => {
    const problem = validateStep(step);
    if (problem) return setError(problem);
    setError(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const profilePayload = () => fromProfileDraft(profileDraft, form.portfolioUrl.trim());

  /** Fields shared by Save draft and signed-in Submit (see lib/candidate-portal/draft-form.ts). */
  const draftFormData = (atStep: number) => {
    const data = new FormData();
    data.set("jobSlug", job.slug);
    if (draft) {
      data.set("draftId", draft.id);
      data.set("revision", String(draft.revision));
    }
    const payload: DraftPayload = {
      contact: {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        location: form.location.trim(),
        linkedinUrl: form.linkedinUrl.trim(),
        portfolioUrl: form.portfolioUrl.trim(),
      },
      profile: profilePayload(),
      answers: [],
      step: atStep,
    };
    data.set("payload", JSON.stringify(payload));
    if (resumeChoice.kind === "library") {
      data.set("resumeChoice", "library");
      data.set("resumeDocumentId", resumeChoice.documentId);
    } else if (resume) {
      data.set("resumeChoice", "upload");
      data.set("resume", resume);
    } else {
      data.set("resumeChoice", "keep");
    }
    return data;
  };

  /** After a save that uploaded a file, the draft points at that library résumé — don't upload it twice. */
  const adoptSavedResume = (saved: { documentId: string; fileName: string } | null) => {
    if (!saved) return;
    setLibrary((list) =>
      list.some((r) => r.documentId === saved.documentId)
        ? list
        : [{ documentId: saved.documentId, fileName: saved.fileName, isDefault: false, uploadedAt: new Date().toISOString() }, ...list],
    );
    setResumeChoice({ kind: "library", documentId: saved.documentId });
    setResume(null);
  };

  const saveDraft = async () => {
    setSaving(true);
    setDraftNote(null);
    try {
      const result = await saveDetailedApplicationDraft(draftFormData(step));
      if (result.ok) {
        setDraft({ id: result.draftId, revision: result.revision, updatedAt: result.savedAt });
        adoptSavedResume(result.resume);
        setDraftNote({ ok: true, text: `Draft saved · ${timeLabel(result.savedAt)}. Continue any time from your candidate portal.` });
      } else {
        setDraftNote({ ok: false, text: result.error });
      }
    } catch {
      setDraftNote({ ok: false, text: "We couldn't save your draft. Please try again." });
    }
    setSaving(false);
  };

  const submit = async () => {
    for (let i = 0; i < STEPS.length - 1; i++) {
      const problem = validateStep(i);
      if (problem) {
        setStep(i);
        return setError(problem);
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      if (signedIn) {
        const result = await submitDetailedApplicationDraft(draftFormData(STEPS.length - 1));
        if (result.ok) setConfirmation(result.applicationNumber || "Submitted");
        else setError(result.error);
      } else {
        if (!resume) return;
        const input: SubmitJobApplicationInput = {
          requisitionId: job.requisitionId || job.id,
          postingId: job.id,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          location: form.location.trim() || undefined,
          linkedinUrl: form.linkedinUrl.trim() || undefined,
          portfolioUrl: form.portfolioUrl.trim() || undefined,
          resumeFileName: resume.name,
        };
        const data = new FormData();
        data.set("resume", resume);
        data.set("profile", JSON.stringify(profilePayload()));
        data.set("answers", "[]");
        const result = await submitDetailedApplication(input, data);
        if (result.ok) setConfirmation(result.applicationNumber);
        else setError(result.error);
      }
    } catch {
      setError("We couldn't complete your application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <div className="apply-page">
        <div className="wrap apply-page-inner">
          <div className="apply-layout apply-layout-confirm">
            <div className="apply-panel apply-confirm">
              <p className="apply-eyebrow">Application received</p>
              <h1>Thank you, {form.firstName}.</h1>
              <p className="apply-confirm-lead">Your application for {job.title} has been submitted.</p>
              <dl className="apply-confirm-ref">
                <dt>Reference</dt>
                <dd>{confirmation}</dd>
              </dl>
              <div className="apply-confirm-next">
                <h4>What happens next</h4>
                <p>Our recruiting team will review your application. If your background aligns with the role, the team may contact you regarding next steps.</p>
              </div>
              <div className="apply-actions apply-actions-end">
                {signedIn ? (
                  <Link href="/candidate/applications" className="btn btn-primary">My applications</Link>
                ) : (
                  <Link href="/jobs" className="btn btn-primary">View more jobs</Link>
                )}
                <Link href="/careers" className="btn btn-dark">Return to Careers</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const returnHere = `/jobs/${job.slug}/apply/detailed`;

  return (
    <div className="apply-page">
      <div className="wrap apply-page-inner">
        <Link href={`/jobs/${job.slug}`} className="apply-back">← Back to job</Link>
        <header className="apply-intro">
          <p className="apply-eyebrow">Detailed Apply</p>
          <h1 className="apply-job-title" style={{ fontSize: "clamp(26px, 3.2vw, 36px)" }}>{job.title}</h1>
          <p className="apply-job-meta">
            {[job.company, job.location, job.employmentType, job.workplaceType].filter(Boolean).join(" · ")}
          </p>
          <p className="apply-job-meta">
            Prefer a 1-minute application? <Link href={`/jobs/${job.slug}/apply`}>Use Easy Apply</Link>
          </p>
          {signedIn ? (
            <p className="apply-job-meta">
              Signed in as {candidate?.email} · <Link href="/candidate/drafts">My drafts</Link>
            </p>
          ) : (
            <p className="apply-job-meta">
              Have a candidate account?{" "}
              <Link href={`/candidate/login?returnTo=${encodeURIComponent(returnHere)}`}>Sign in to save your progress</Link>
            </p>
          )}
        </header>

        {candidate?.inProgress ? (
          <p className="apply-trust" role="status">
            An application for this job is being submitted from another window. Check{" "}
            <Link href="/candidate/applications">My applications</Link> before submitting again.
          </p>
        ) : null}

        <ol className="apply-stepper" aria-label="Application steps">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? "step" : undefined} className={i < step ? "done" : undefined}>
              <span>{i + 1}</span> {label}
            </li>
          ))}
        </ol>

        <div className="apply-layout">
          <form className="apply-panel" onSubmit={(e) => e.preventDefault()} noValidate>
            <h2 className="apply-step-heading">{STEPS[step]}</h2>

            {step === 0 ? (
              <>
                <div className="apply-grid-2">
                  <Field id="firstName" label="First name *" value={form.firstName} onChange={(v) => set("firstName", v)} autoComplete="given-name" />
                  <Field id="lastName" label="Last name *" value={form.lastName} onChange={(v) => set("lastName", v)} autoComplete="family-name" />
                  <Field
                    id="email"
                    label={signedIn ? "Email (your sign-in)" : "Email *"}
                    type="email"
                    value={form.email}
                    onChange={(v) => set("email", v)}
                    autoComplete="email"
                    readOnly={signedIn}
                  />
                  <Field id="phone" label="Phone *" type="tel" value={form.phone} onChange={(v) => set("phone", v)} autoComplete="tel" />
                </div>
                <Field id="location" label="City / State" value={form.location} onChange={(v) => set("location", v)} autoComplete="address-level2" />
                <div className="apply-grid-2">
                  <Field id="linkedinUrl" label="LinkedIn (optional)" type="url" value={form.linkedinUrl} onChange={(v) => set("linkedinUrl", v)} />
                  <Field id="portfolioUrl" label="Portfolio (optional)" type="url" value={form.portfolioUrl} onChange={(v) => set("portfolioUrl", v)} />
                </div>
              </>
            ) : null}

            {step === 1 ? (
              <>
                {signedIn && library.length > 0 ? (
                  <fieldset className="apply-field cp-resume-pick">
                    <legend>Choose a résumé *</legend>
                    {library.map((r) => (
                      <label key={r.documentId} className="cp-radio">
                        <input
                          type="radio"
                          name="resumeChoice"
                          checked={resumeChoice.kind === "library" && resumeChoice.documentId === r.documentId}
                          onChange={() => {
                            setError(null);
                            setResumeChoice({ kind: "library", documentId: r.documentId });
                          }}
                        />
                        <span>
                          {r.fileName}
                          {r.isDefault ? <span className="ws-pill blue">Default</span> : null}
                        </span>
                      </label>
                    ))}
                    <label className="cp-radio">
                      <input
                        type="radio"
                        name="resumeChoice"
                        checked={resumeChoice.kind === "upload"}
                        onChange={() => setResumeChoice({ kind: "upload" })}
                      />
                      <span>Upload a new résumé</span>
                    </label>
                  </fieldset>
                ) : null}
                {resumeChoice.kind === "upload" ? (
                  <div className="apply-field">
                    <label htmlFor="resume">Resume * (PDF, DOC or DOCX · max 10 MB)</label>
                    <input id="resume" type="file" accept={ACCEPT} onChange={(e) => void onResume(e.target.files?.[0] ?? null)} />
                  </div>
                ) : null}
                {resumeChoice.kind === "upload" && resume ? <p className="apply-job-meta">Selected: {resume.name}</p> : null}
                {parsing ? <p className="apply-job-meta">Reading your resume…</p> : null}
                {parseNote ? <p className="apply-trust">{parseNote}</p> : null}
                <p className="apply-trust">
                  {signedIn
                    ? "Saving a draft stores a new upload privately in your résumé library."
                    : "Your resume is stored privately and shared only with the Consult America recruiting team."}
                </p>
              </>
            ) : null}

            {step === 2 ? (
              <ProfileEditor
                value={profileDraft}
                onChange={(next) => setForm((f) => ({ ...f, ...next }))}
                idPrefix="da"
              />
            ) : null}

            {step === 3 ? <p className="apply-job-meta">This role has no additional screening questions.</p> : null}

            {step === 4 ? (
              <div className="apply-review">
                <dl>
                  <dt>Name</dt>
                  <dd>{form.firstName} {form.lastName}</dd>
                  <dt>Contact</dt>
                  <dd>{form.email} · {form.phone}</dd>
                  {form.location ? (<><dt>Location</dt><dd>{form.location}</dd></>) : null}
                  <dt>Resume</dt>
                  <dd>{resumeLabel()}</dd>
                  <dt>Skills</dt>
                  <dd>{splitList(form.skills).join(", ") || "—"}</dd>
                  <dt>Experience</dt>
                  <dd>{form.experience.filter((e) => e.title).map((e) => `${e.title}${e.company ? ` · ${e.company}` : ""}`).join("; ") || "—"}</dd>
                  <dt>Education</dt>
                  <dd>{form.education.filter((e) => e.institution || e.degree).map((e) => [e.degree, e.institution].filter(Boolean).join(", ")).join("; ") || "—"}</dd>
                  <dt>Certifications</dt>
                  <dd>{splitList(form.certifications).join(", ") || "—"}</dd>
                </dl>
              </div>
            ) : null}

            {error ? <p className="apply-error" role="alert">{error}</p> : null}
            {draftNote ? (
              <p className={draftNote.ok ? "apply-trust" : "apply-error"} role={draftNote.ok ? "status" : "alert"}>
                {draftNote.text}
              </p>
            ) : null}

            <div className="apply-actions">
              {step > 0 ? (
                <button type="button" className="btn btn-dark" onClick={() => { setError(null); setStep((s) => s - 1); }}>Back</button>
              ) : (
                <Link href={`/jobs/${job.slug}`} className="btn btn-dark">Cancel</Link>
              )}
              {signedIn ? (
                <button type="button" className="btn btn-outline cp-save-draft" onClick={() => void saveDraft()} disabled={saving || submitting || parsing}>
                  {saving ? "Saving…" : "Save draft"}
                </button>
              ) : null}
              {step < STEPS.length - 1 ? (
                <button type="button" className="btn btn-primary" onClick={next} disabled={parsing}>Continue →</button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={submitting || saving}>
                  {submitting ? "Submitting application…" : "Submit application →"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="apply-field">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type={props.type ?? "text"}
        autoComplete={props.autoComplete}
        value={props.value}
        disabled={props.disabled}
        readOnly={props.readOnly}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}
