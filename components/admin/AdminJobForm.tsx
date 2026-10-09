"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import type { JobActionResult } from "@/app/admin/jobs/actions";
import {
  EMPLOYMENT_TYPES,
  WORKPLACE_TYPES,
  type EmploymentType,
  type WorkplaceType,
} from "@/lib/neon/types";

/**
 * Create and edit a job in the Neon-backed admin area.
 *
 * Deliberately NOT components/workspace/JobForm.tsx. That form targets the
 * Supabase requisition schema, where department, position and location are
 * foreign keys into lookup tables and therefore dropdowns that have to be
 * populated. The Neon `jobs` table stores department and location as plain
 * TEXT, so they are free-text inputs here and there is nothing to look up.
 * Sharing one component across two schemas would mean every field carrying a
 * branch for which database it is talking to.
 *
 * A client component because the submit path needs three things a plain form
 * post cannot give: the action's { ok:false, error } rendered inline without
 * losing what was typed, a disabled button while the write is in flight, and a
 * redirect to the new job's own page afterwards.
 *
 * Field names here are the contract with app/admin/jobs/actions.ts. They match
 * the column names in db/neon/001_init.sql in camelCase.
 */

export type AdminJobFormValues = {
  /** Edit mode only. Submitted as a hidden `id` field so updateJobAction can find the row. */
  id: string;
  title: string;
  department: string;
  location: string;
  workplaceType: WorkplaceType;
  employmentType: EmploymentType;
  /** Free text in the schema, not an enum — so a free-text input, not a select. */
  experienceLevel: string;
  /** "" means "not stated". Kept as strings so an empty input never becomes 0. */
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  description: string;
  /** One item per line, which is exactly how the textarea holds it. */
  responsibilities: string;
  requirements: string;
  benefits: string;
  /** yyyy-mm-dd, or "" for no deadline. */
  applicationDeadline: string;
};

export type AdminJobFormProps = {
  mode: "create" | "edit";
  action: (formData: FormData) => Promise<JobActionResult>;
  initial?: Partial<AdminJobFormValues>;
  /** Where Cancel goes. The pages know their own context; this component does not. */
  cancelHref: string;
};

/**
 * Written out here rather than imported from @/types/organization: that map
 * belongs to the Supabase domain types and does not carry INTERNSHIP, which the
 * Neon employment_type CHECK does. Keys are the CHECK values verbatim.
 */
const WORKPLACE_LABELS: Record<WorkplaceType, string> = {
  // "Onsite" rather than "On site" so these labels match, word for word, the
  // humanised CHECK values the list and detail pages render.
  ONSITE: "Onsite",
  HYBRID: "Hybrid",
  REMOTE: "Remote",
};

const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACT: "Contract",
  TEMPORARY: "Temporary",
  INTERNSHIP: "Internship",
};

/** Mirrors the column defaults in db/neon/001_init.sql, so a form left alone
 *  and a form never rendered produce the same row. */
const CREATE_DEFAULTS = {
  workplaceType: "ONSITE" as WorkplaceType,
  employmentType: "FULL_TIME" as EmploymentType,
  salaryCurrency: "USD",
};

function RequiredMark() {
  // `required` on the input is what assistive tech announces. This is only the
  // matching visual cue, so it must not be read out a second time.
  return (
    <span className="ws-form-required" aria-hidden="true">
      {" *"}
    </span>
  );
}

/** A textarea whose stored value is a TEXT[] column: one element per line. */
function ListField({
  id,
  label,
  rows,
  value,
  hint,
}: {
  id: "responsibilities" | "requirements" | "benefits";
  label: string;
  rows: number;
  value: string;
  hint: string;
}) {
  const helpId = `${id}-help`;
  return (
    <div className="apply-field ws-form-span">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} name={id} rows={rows} defaultValue={value} aria-describedby={helpId} />
      <span id={helpId} className="ws-field-meta">
        {hint}
      </span>
    </div>
  );
}

export function AdminJobForm({ mode, action, initial, cancelHref }: AdminJobFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // The form is taller than a viewport, so the submit button can easily sit a
  // screen below the error region. Move focus to the message instead of
  // reporting a failure somewhere the admin is not looking.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const id = initial?.id ?? "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Read synchronously: `currentTarget` is already null by the time the
    // transition's async callback runs.
    const formData = new FormData(event.currentTarget);

    // Client-side mirror of the jobs_salary_range_ck CHECK. The server checks
    // this too (it has to — the form is not the only possible caller); doing it
    // here as well saves a round trip and points at the field.
    const min = String(formData.get("salaryMin") ?? "").trim();
    const max = String(formData.get("salaryMax") ?? "").trim();
    if (min !== "" && max !== "" && Number(min) > Number(max)) {
      setError("Minimum salary cannot be above the maximum.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Inside the transition, so `pending` covers the navigation too and the
      // button cannot be pressed a second time while it happens.
      router.push(`/admin/jobs/${result.id}`);
    });
  }

  // Native validation is left on (no noValidate): `required` on the four
  // mandatory inputs is the cheapest possible first pass, and every rule it
  // enforces is re-checked server-side in actions.ts.
  return (
    <form className="ws-form" onSubmit={handleSubmit}>
      {error ? (
        <div ref={errorRef} className="ws-form-error" role="alert" tabIndex={-1}>
          {error}
        </div>
      ) : null}

      <p className="ws-muted ws-form-hint">Fields marked * are required.</p>

      {mode === "edit" ? <input type="hidden" name="id" value={id} /> : null}

      <fieldset className="ws-panel ws-form-fieldset">
        <legend className="ws-form-legend">The role</legend>
        <div className="ws-form-grid">
          <div className="apply-field ws-form-span">
            <label htmlFor="title">
              Job title
              <RequiredMark />
            </label>
            <input
              id="title"
              name="title"
              required
              maxLength={200}
              defaultValue={initial?.title ?? ""}
              aria-describedby="title-help"
            />
            <span id="title-help" className="ws-field-meta">
              The title candidates see. The public URL is generated from it once, at creation, and
              then never changes — so a shared link keeps working after a retitle.
            </span>
          </div>

          <div className="apply-field">
            <label htmlFor="department">
              Department
              <RequiredMark />
            </label>
            <input
              id="department"
              name="department"
              required
              maxLength={120}
              defaultValue={initial?.department ?? ""}
              aria-describedby="department-help"
            />
            <span id="department-help" className="ws-field-meta">
              Typed in, not picked from a list. Keep the spelling consistent with existing jobs so
              the department filter groups them together.
            </span>
          </div>

          <div className="apply-field">
            <label htmlFor="location">
              Location
              <RequiredMark />
            </label>
            <input
              id="location"
              name="location"
              required
              maxLength={120}
              defaultValue={initial?.location ?? ""}
              aria-describedby="location-help"
            />
            <span id="location-help" className="ws-field-meta">
              For example &ldquo;Edison, NJ&rdquo; or &ldquo;Remote (US)&rdquo;.
            </span>
          </div>

          <div className="apply-field">
            <label htmlFor="workplaceType">Work arrangement</label>
            <select
              id="workplaceType"
              name="workplaceType"
              defaultValue={initial?.workplaceType ?? CREATE_DEFAULTS.workplaceType}
            >
              {WORKPLACE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {WORKPLACE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="apply-field">
            <label htmlFor="employmentType">Employment type</label>
            <select
              id="employmentType"
              name="employmentType"
              defaultValue={initial?.employmentType ?? CREATE_DEFAULTS.employmentType}
            >
              {EMPLOYMENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {EMPLOYMENT_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="apply-field">
            <label htmlFor="experienceLevel">Experience level</label>
            <input
              id="experienceLevel"
              name="experienceLevel"
              maxLength={120}
              defaultValue={initial?.experienceLevel ?? ""}
              aria-describedby="experienceLevel-help"
            />
            <span id="experienceLevel-help" className="ws-field-meta">
              Optional free text, for example &ldquo;Senior&rdquo; or &ldquo;5+ years&rdquo;.
            </span>
          </div>
        </div>
      </fieldset>

      <fieldset className="ws-panel ws-form-fieldset">
        <legend className="ws-form-legend">Compensation</legend>
        <p className="ws-muted ws-form-intro">
          Optional. Leave both figures blank until a range is approved — a blank range publishes as
          &ldquo;not specified&rdquo;, never as zero.
        </p>
        <div className="ws-form-grid">
          <div className="apply-field">
            <label htmlFor="salaryMin">Minimum salary</label>
            <input
              id="salaryMin"
              name="salaryMin"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              defaultValue={initial?.salaryMin ?? ""}
            />
          </div>
          <div className="apply-field">
            <label htmlFor="salaryMax">Maximum salary</label>
            <input
              id="salaryMax"
              name="salaryMax"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              defaultValue={initial?.salaryMax ?? ""}
              aria-describedby="salaryMax-help"
            />
            <span id="salaryMax-help" className="ws-field-meta">
              Must not be below the minimum.
            </span>
          </div>
          <div className="apply-field">
            <label htmlFor="salaryCurrency">Currency</label>
            <input
              id="salaryCurrency"
              name="salaryCurrency"
              maxLength={3}
              size={5}
              autoCapitalize="characters"
              spellCheck={false}
              defaultValue={initial?.salaryCurrency ?? CREATE_DEFAULTS.salaryCurrency}
              aria-describedby="salaryCurrency-help"
            />
            <span id="salaryCurrency-help" className="ws-field-meta">
              Three-letter code. Defaults to USD.
            </span>
          </div>
        </div>
      </fieldset>

      <fieldset className="ws-panel ws-form-fieldset">
        <legend className="ws-form-legend">Description</legend>
        <div className="ws-form-grid">
          <div className="apply-field ws-form-span">
            <label htmlFor="description">
              About the role
              <RequiredMark />
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={9}
              maxLength={12_000}
              defaultValue={initial?.description ?? ""}
              aria-describedby="description-help"
            />
            <span id="description-help" className="ws-field-meta">
              Prose, rendered as paragraphs. The three lists below are stored separately so the
              careers page can format them as bullets without parsing this text.
            </span>
          </div>
          <ListField
            id="responsibilities"
            label="Responsibilities"
            rows={6}
            value={initial?.responsibilities ?? ""}
            hint="One per line. Blank lines are ignored."
          />
          <ListField
            id="requirements"
            label="Requirements"
            rows={6}
            value={initial?.requirements ?? ""}
            hint="One per line. Blank lines are ignored."
          />
          <ListField
            id="benefits"
            label="Benefits"
            rows={4}
            value={initial?.benefits ?? ""}
            hint="One per line. Blank lines are ignored."
          />
        </div>
      </fieldset>

      <fieldset className="ws-panel ws-form-fieldset">
        <legend className="ws-form-legend">Publishing</legend>
        <p className="ws-muted ws-form-intro">
          {mode === "create"
            ? "Saving creates a draft unless you tick the box below. Drafts are internal and never appear on the public careers page."
            : "Saving changes the text and details only. Publishing and unpublishing stay separate actions, so an edit can never put a job live by accident."}
        </p>
        <div className="ws-form-grid">
          <div className="apply-field">
            <label htmlFor="applicationDeadline">Closing date</label>
            <input
              id="applicationDeadline"
              name="applicationDeadline"
              type="date"
              defaultValue={initial?.applicationDeadline ?? ""}
              aria-describedby="applicationDeadline-help"
            />
            <span id="applicationDeadline-help" className="ws-field-meta">
              Optional. Applications close at the end of this day, UTC.
            </span>
          </div>

          {mode === "create" ? (
            <div className="ws-form-span ws-form-check">
              {/* Unchecked by default, and that is a safety property rather than
                  a preference: a mis-click while creating a job must leave a
                  draft, not a live posting on the public careers page. */}
              <input id="publishNow" name="publishNow" type="checkbox" />
              <span className="ws-form-check-text">
                <label htmlFor="publishNow">Publish immediately</label>
                <span className="ws-field-meta">
                  Leave this unchecked to save a draft you can review and publish from the job&rsquo;s
                  own page.
                </span>
              </span>
            </div>
          ) : null}
        </div>
      </fieldset>

      <div className="ws-actions">
        <button type="submit" className="ws-btn primary" disabled={pending}>
          {pending
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
              ? "Create job"
              : "Save changes"}
        </button>
        <Link className="ws-btn" href={cancelHref}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
