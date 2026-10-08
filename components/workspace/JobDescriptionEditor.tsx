"use client";

import { useActionState, useMemo, useState } from "react";

import { saveJobDescriptionAction, type JobDescriptionState } from "@/app/actions/job-description";
import { assessJobCompleteness, linesFrom } from "@/lib/jobs/completeness";

export type JobDescriptionEditorProps = {
  requisitionId: string;
  hasPosting: boolean;
  locationName?: string;
  initial: {
    summary: string;
    description: string;
    responsibilities: string[];
    qualifications: string[];
    preferredQualifications: string[];
    experienceLevel: string;
    /** yyyy-mm-dd or "" */
    applicationDeadline: string;
  };
};

const EXPERIENCE_LEVELS = ["", "Entry Level", "Associate", "Mid Level", "Senior", "Lead", "Manager", "Director"];

/**
 * Completes a job description before (or after) publication. The readiness
 * checklist updates as you type; saving never publishes the job.
 */
export function JobDescriptionEditor({ requisitionId, hasPosting, locationName, initial }: JobDescriptionEditorProps) {
  const [state, action, pending] = useActionState<JobDescriptionState, FormData>(
    saveJobDescriptionAction.bind(null, requisitionId),
    { ok: null, message: null },
  );
  const [draft, setDraft] = useState({
    summary: initial.summary,
    description: initial.description,
    responsibilities: initial.responsibilities.join("\n"),
    qualifications: initial.qualifications.join("\n"),
    preferredQualifications: initial.preferredQualifications.join("\n"),
  });
  const set = (key: keyof typeof draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));

  const readiness = useMemo(
    () =>
      assessJobCompleteness({
        summary: hasPosting ? draft.summary : undefined,
        description: draft.description,
        responsibilities: linesFrom(draft.responsibilities),
        qualifications: linesFrom(draft.qualifications),
        preferredQualifications: linesFrom(draft.preferredQualifications),
        locationName,
      }),
    [draft, hasPosting, locationName],
  );

  return (
    <div className="ws-grid-wide">
      <form action={action} className="ws-panel ws-form">
        <h2>Job description</h2>
        <p className="ws-muted" style={{ marginBottom: 16 }}>
          Write only what the hiring team has approved. Saving updates the requisition{hasPosting ? " and its posting text" : ""};
          it never publishes or unpublishes the job.
        </p>
        {hasPosting ? (
          <div className="apply-field">
            <label htmlFor="jd-summary">Listing summary (shown on job cards)</label>
            <textarea id="jd-summary" name="summary" rows={2} maxLength={300} value={draft.summary} onChange={set("summary")} />
          </div>
        ) : (
          <input type="hidden" name="summary" value={draft.summary} />
        )}
        <div className="apply-field">
          <label htmlFor="jd-description">About the role</label>
          <textarea id="jd-description" name="description" rows={8} required value={draft.description} onChange={set("description")} />
        </div>
        <div className="apply-field">
          <label htmlFor="jd-resp">Key responsibilities (one per line)</label>
          <textarea id="jd-resp" name="responsibilities" rows={6} value={draft.responsibilities} onChange={set("responsibilities")} />
        </div>
        <div className="apply-field">
          <label htmlFor="jd-qual">Required qualifications (one per line — include years, education and certifications here)</label>
          <textarea id="jd-qual" name="qualifications" rows={6} value={draft.qualifications} onChange={set("qualifications")} />
        </div>
        <div className="apply-field">
          <label htmlFor="jd-pref">Preferred qualifications (one per line)</label>
          <textarea id="jd-pref" name="preferredQualifications" rows={4} value={draft.preferredQualifications} onChange={set("preferredQualifications")} />
        </div>
        {hasPosting ? (
          <div className="apply-grid-2">
            <div className="apply-field">
              <label htmlFor="jd-level">Experience level</label>
              <select id="jd-level" name="experienceLevel" defaultValue={initial.experienceLevel}>
                {EXPERIENCE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level || "Not specified"}
                  </option>
                ))}
              </select>
            </div>
            <div className="apply-field">
              <label htmlFor="jd-deadline">Closing date (optional)</label>
              <input id="jd-deadline" name="applicationDeadline" type="date" defaultValue={initial.applicationDeadline} />
            </div>
          </div>
        ) : null}
        {state.message ? (
          <p className={state.ok ? "cp-msg" : "apply-error"} role={state.ok ? "status" : "alert"}>
            {state.message}
          </p>
        ) : null}
        <div className="ws-actions">
          <button type="submit" className="ws-btn primary" disabled={pending}>
            {pending ? "Saving…" : "Save description"}
          </button>
        </div>
      </form>

      <section className="ws-panel" aria-live="polite">
        <h2>Publication readiness</h2>
        <p className="ws-muted" style={{ marginBottom: 12 }}>
          {readiness.ready ? "Complete enough to publish." : "Complete these before publishing."} Publishing stays a separate,
          approved step.
        </p>
        <ul className="ws-list ws-checklist">
          {readiness.checks.map((check) => (
            <li key={check.id} className={check.ok ? "ok" : "todo"}>
              <span aria-hidden>{check.ok ? "✓" : "•"}</span> {check.label}
              {check.detail ? <span className="ws-muted"> — {check.detail}</span> : null}
              <span className="sr-only">{check.ok ? " (done)" : " (to do)"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
