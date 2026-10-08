"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import {
  removeLibraryResume,
  saveResumeCorrections,
  setDefaultLibraryResume,
  uploadLibraryResume,
  type ActionResult,
} from "@/app/actions/candidate-portal";
import { ConfirmActionButton } from "@/components/candidate/ConfirmActionButton";
import { ProfileEditor, fromProfileDraft, toProfileDraft, type ProfileDraft } from "@/components/candidate/ProfileEditor";
import { formatDate, formatFileSize, parseStateLabel } from "@/lib/candidate-portal/labels";
import type { LibraryResume, ResumeProfileView } from "@/lib/candidate-portal/types";
import type { DetailedProfile } from "@/lib/recruiting/detailed-profile";

const ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type LibraryEntry = { resume: LibraryResume; profile: ResumeProfileView | null; effective: DetailedProfile };

export function ResumeUploadForm({ hasResumes }: { hasResumes: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(uploadLibraryResume, null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={action} className="cp-upload" noValidate>
      <div className="apply-field">
        <label htmlFor="lib-resume">Upload a résumé (PDF, DOC or DOCX · max 10 MB)</label>
        <input id="lib-resume" name="resume" type="file" accept={ACCEPT} required />
      </div>
      <label className="cp-check">
        <input type="checkbox" name="makeDefault" defaultChecked={!hasResumes} /> Use as my default résumé
      </label>
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? "Uploading…" : "Upload résumé"}
      </button>
      {state ? (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "cp-msg" : "apply-error"}>
          {state.ok ? state.message : state.error}
        </p>
      ) : null}
      <p className="apply-trust">Résumés are stored privately and shared only with Consult America recruiters when you apply.</p>
    </form>
  );
}

export function ResumeEntry({ entry }: { entry: LibraryEntry }) {
  const { resume, profile, effective } = entry;
  const state = parseStateLabel(resume.parse.state);
  const [editing, setEditing] = useState(false);
  const fileHref = `/candidate/resumes/${encodeURIComponent(resume.documentId)}/file`;
  const archived = resume.status === "ARCHIVED";

  return (
    <li className="cp-resume">
      <div className="cp-resume-head">
        <div>
          <strong className="cp-resume-name">{resume.fileName}</strong>
          <div className="ws-muted">
            Uploaded {formatDate(resume.uploadedAt)}
            {resume.fileSize ? ` · ${formatFileSize(resume.fileSize)}` : ""}
            {resume.applicationCount > 0
              ? ` · Submitted with ${resume.applicationCount} application${resume.applicationCount === 1 ? "" : "s"}`
              : ""}
          </div>
        </div>
        <div className="cp-resume-badges">
          {resume.isDefault ? <span className="ws-pill blue">Default</span> : null}
          {archived ? <span className="ws-pill">Previous version</span> : <span className={`ws-pill ${state.tone}`}>{state.label}</span>}
        </div>
      </div>

      <div className="cp-resume-actions">
        <a href={fileHref} target="_blank" rel="noopener">
          Preview
        </a>
        <a href={`${fileHref}?download=1`}>Download</a>
        {!archived && !resume.isDefault ? (
          <ConfirmActionButton run={setDefaultLibraryResume.bind(null, resume.documentId)} label="Make default" pendingLabel="Saving…" />
        ) : null}
        {!archived ? (
          <ConfirmActionButton
            run={removeLibraryResume.bind(null, resume.documentId)}
            label="Remove"
            pendingLabel="Removing…"
            confirmText={
              resume.applicationCount > 0
                ? "Remove this résumé from your library? Applications you already submitted keep the copy you sent."
                : "Delete this résumé? This can't be undone."
            }
          />
        ) : null}
      </div>

      {!archived && profile ? (
        <div className="cp-extract">
          {resume.parse.state === "PARSED" ? (
            <>
              <h3>
                {profile.reviewed ? "Your reviewed profile" : "What we found in this résumé"}
                {profile.reviewedAt ? <span className="ws-muted"> · corrected {formatDate(profile.reviewedAt)}</span> : null}
              </h3>
              {editing ? (
                <ReviewEditor documentId={resume.documentId} initial={effective} onDone={() => setEditing(false)} />
              ) : (
                <>
                  <ExtractedSummary profile={effective} />
                  <button type="button" className="apply-text-btn" onClick={() => setEditing(true)}>
                    Review &amp; correct details
                  </button>
                </>
              )}
              {profile.parserVersion ? <p className="cp-fine">Read by {profile.parserVersion}. Your corrections never change the original file.</p> : null}
            </>
          ) : resume.parse.state === "PENDING" ? (
            <p className="ws-muted">We&apos;re reading this résumé. Refresh in a moment to review what we found.</p>
          ) : (
            <p className="ws-muted">
              We couldn&apos;t read text from this file (it may be scanned or protected). It can still be submitted with
              applications; you can enter your details in Detailed Apply.
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}

function ExtractedSummary({ profile }: { profile: DetailedProfile }) {
  return (
    <dl className="ws-dl cp-dl">
      <dt>Skills</dt>
      <dd>
        {profile.skills.length ? (
          <span className="ws-chips">
            {profile.skills.slice(0, 30).map((s) => (
              <span key={s} className="ws-chip">
                {s}
              </span>
            ))}
          </span>
        ) : (
          "—"
        )}
      </dd>
      <dt>Experience</dt>
      <dd>
        {profile.experience.length
          ? profile.experience.map((e, i) => (
              <div key={i}>
                {e.title}
                {e.company ? ` · ${e.company}` : ""}
                <span className="ws-muted">
                  {e.startDate || e.endDate || e.isCurrent ? ` (${e.startDate || "?"} – ${e.isCurrent ? "present" : e.endDate || "?"})` : ""}
                </span>
              </div>
            ))
          : "—"}
      </dd>
      <dt>Education</dt>
      <dd>
        {profile.education.length
          ? profile.education.map((e, i) => <div key={i}>{[e.degree, e.fieldOfStudy, e.institution].filter(Boolean).join(", ")}</div>)
          : "—"}
      </dd>
      <dt>Certifications</dt>
      <dd>{profile.certifications.length ? profile.certifications.join(", ") : "—"}</dd>
    </dl>
  );
}

function ReviewEditor({ documentId, initial, onDone }: { documentId: string; initial: DetailedProfile; onDone: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProfileDraft>(() => toProfileDraft(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="cp-review">
      <ProfileEditor value={draft} onChange={setDraft} idPrefix={`rv-${documentId}`} />
      {error ? (
        <p className="apply-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="apply-actions">
        <button type="button" className="btn btn-dark btn-sm" onClick={onDone} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await saveResumeCorrections(documentId, JSON.stringify(fromProfileDraft(draft, initial.portfolioUrl ?? "")));
              if (!result.ok) return setError(result.error);
              router.refresh();
              onDone();
            })
          }
        >
          {pending ? "Saving…" : "Save corrections"}
        </button>
      </div>
    </div>
  );
}
