"use client";

import { useActionState } from "react";

import { updateCandidateProfile, type ActionResult } from "@/app/actions/candidate-portal";
import type { CandidateProfile } from "@/lib/candidate-portal/types";

const FIELDS: { name: keyof CandidateProfile; label: string; type?: string; autoComplete?: string; wide?: boolean }[] = [
  { name: "firstName", label: "First name *", autoComplete: "given-name" },
  { name: "lastName", label: "Last name *", autoComplete: "family-name" },
  { name: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
  { name: "workAuthorization", label: "Work authorization" },
  { name: "city", label: "City", autoComplete: "address-level2" },
  { name: "state", label: "State / region", autoComplete: "address-level1" },
  { name: "linkedinUrl", label: "LinkedIn URL", type: "url" },
  { name: "portfolioUrl", label: "Portfolio URL", type: "url" },
  { name: "githubUrl", label: "GitHub URL", type: "url" },
];

export function ProfileForm({ profile }: { profile: CandidateProfile }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateCandidateProfile, null);

  return (
    <form action={action} className="ws-form cp-form" noValidate>
      <div className="apply-field">
        <label htmlFor="pf-email">Email (sign-in)</label>
        <input id="pf-email" value={profile.email} readOnly aria-describedby="pf-email-note" />
        <p id="pf-email-note" className="ws-muted">
          Your sign-in email links this portal to your applications, so it can&apos;t be changed here.
        </p>
      </div>
      <div className="apply-grid-2">
        {FIELDS.map((f) => (
          <div className="apply-field" key={f.name}>
            <label htmlFor={`pf-${f.name}`}>{f.label}</label>
            <input
              id={`pf-${f.name}`}
              name={f.name}
              type={f.type ?? "text"}
              autoComplete={f.autoComplete}
              defaultValue={profile[f.name]}
            />
          </div>
        ))}
      </div>
      <div className="apply-field">
        <label htmlFor="pf-summary">Professional summary</label>
        <textarea id="pf-summary" name="professionalSummary" rows={4} defaultValue={profile.professionalSummary} />
      </div>
      {state ? (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "cp-msg" : "apply-error"}>
          {state.ok ? state.message : state.error}
        </p>
      ) : null}
      <div className="apply-actions apply-actions-end">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}
