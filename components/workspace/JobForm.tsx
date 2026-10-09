"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import { careerAreaLabels } from "@/data/jobs";
import { EXPERIENCE_LEVELS } from "@/lib/jobs/portal";
import type { JobActionResult } from "@/lib/recruiting/job-actions";
import {
  employmentTypeLabels,
  workplaceTypeLabels,
  type EmploymentType,
  type WorkplaceType,
} from "@/types/organization";
import type { CareerArea } from "@/types/recruiting";

/**
 * One dropdown option. Structurally identical to the repository's
 * `LookupOption`, declared locally so this client component carries no import
 * from a server-only module graph.
 */
export type JobFormOption = { id: string; name: string };

export type JobFormLookups = {
  departments: JobFormOption[];
  locations: JobFormOption[];
  positions: JobFormOption[];
};

/**
 * Initial values in *form* shape — strings and string arrays, never numbers
 * wrapped in optionals — so the page that loads a requisition does the
 * domain-to-input conversion once instead of every input doing it inline.
 */
export type JobFormValues = {
  /** Edit mode only; submitted as a hidden field so updateJobAction can find the row. */
  requisitionId: string;
  title: string;
  departmentId: string;
  positionId: string;
  locationId: string;
  employmentType: EmploymentType;
  workplaceType: WorkplaceType;
  careerArea: CareerArea;
  openings: number;
  /** "" means "not stated" — salary is optional end to end. */
  salaryMin: string;
  salaryMax: string;
  experienceLevel: string;
  /** yyyy-mm-dd, or "" for no deadline. */
  applicationDeadline: string;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  preferredQualifications: string[];
  benefits: string[];
};

export type JobFormProps = {
  mode: "create" | "edit";
  lookups: JobFormLookups;
  initial?: Partial<JobFormValues>;
  action: (formData: FormData) => Promise<JobActionResult>;
};

/**
 * Derived from the label maps rather than written out again: adding a career
 * area or employment type to the domain cannot silently skip this form.
 */
const EMPLOYMENT_TYPES = Object.keys(employmentTypeLabels) as EmploymentType[];
const WORKPLACE_TYPES = Object.keys(workplaceTypeLabels) as WorkplaceType[];
const CAREER_AREAS = Object.keys(careerAreaLabels) as CareerArea[];

/**
 * Defaults for a brand-new requisition. ONSITE rather than REMOTE because a
 * posting that over-promises remote work is a commitment to candidates, and
 * these mirror the server action's own fallbacks so a skipped select and an
 * untouched select produce the same requisition.
 */
const CREATE_DEFAULTS = {
  employmentType: "FULL_TIME" as EmploymentType,
  workplaceType: "ONSITE" as WorkplaceType,
  careerArea: "experienced-professionals" as CareerArea,
  openings: 1,
};

function RequiredMark() {
  // The `required` attribute is what assistive tech announces; this is the
  // matching visual cue, so it must not be read out a second time.
  return (
    <span className="ws-form-required" aria-hidden="true">
      {" *"}
    </span>
  );
}

/** A select backed by an FK lookup table, which may legitimately be empty. */
function LookupSelect({
  id,
  label,
  options,
  value,
  placeholder,
  emptyLabel,
}: {
  id: "departmentId" | "positionId" | "locationId";
  label: string;
  options: JobFormOption[];
  value: string;
  placeholder: string;
  emptyLabel: string;
}) {
  const empty = options.length === 0;
  const known = options.some((option) => option.id === value);
  return (
    <div className="apply-field">
      <label htmlFor={id}>
        {label}
        <RequiredMark />
      </label>
      <select id={id} name={id} required disabled={empty} defaultValue={known ? value : ""}>
        {empty ? (
          <option value="">{emptyLabel}</option>
        ) : (
          <>
            <option value="">{placeholder}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </>
        )}
      </select>
      {/* A disabled control submits nothing. Without this, editing an unrelated
          field while a lookup is unavailable would silently clear the FK. */}
      {empty && value ? <input type="hidden" name={id} value={value} /> : null}
    </div>
  );
}

/** A select over a closed domain union, labelled from its own label map. */
function EnumSelect<T extends string>({
  id,
  label,
  keys,
  labels,
  value,
}: {
  id: string;
  label: string;
  keys: T[];
  labels: Record<T, string>;
  value: T;
}) {
  return (
    <div className="apply-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={id} defaultValue={value}>
        {keys.map((key) => (
          <option key={key} value={key}>
            {labels[key]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A textarea whose stored value is a list: one item per line. */
function ListField({
  id,
  label,
  rows,
  value,
}: {
  id: string;
  label: string;
  rows: number;
  value: string[];
}) {
  const helpId = `${id}-help`;
  return (
    <div className="apply-field ws-form-span">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} name={id} rows={rows} defaultValue={value.join("\n")} aria-describedby={helpId} />
      <span id={helpId} className="ws-field-meta">
        One item per line. Blank lines are ignored.
      </span>
    </div>
  );
}

/**
 * Create and edit a job requisition. The same component serves both so the two
 * screens cannot drift apart; `mode` only controls the hidden id, the publish
 * checkbox, the button labels and where Cancel goes.
 *
 * Publishing is deliberately opt-in: an unchecked box saves a draft, and a
 * draft is not on the public careers site.
 */
export function JobForm({ mode, lookups, initial, action }: JobFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // The form is long enough that the submit button can sit a screen below the
  // error, so move focus to the message instead of reporting it out of sight.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const requisitionId = initial?.requisitionId ?? "";

  /**
   * Required FK lookups with nothing to select and no value already saved. In
   * that state the requisition cannot be written at all, so the form says so
   * once at the top rather than failing on submit.
   */
  const unavailable = (
    [
      ["department", lookups.departments, initial?.departmentId],
      ["position", lookups.positions, initial?.positionId],
      ["location", lookups.locations, initial?.locationId],
    ] as const
  )
    .filter(([, options, saved]) => options.length === 0 && !saved)
    .map(([name]) => name);
  const blocked = unavailable.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // FormData must be read synchronously: `currentTarget` is null by the time
    // the transition's async callback runs.
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Stays inside the transition, so `pending` covers the navigation too and
      // the button cannot be pressed twice.
      router.push(`/app/recruiting/jobs/${result.requisitionId}`);
    });
  }

  return (
    <form className="ws-form" onSubmit={handleSubmit}>
      {error ? (
        <div ref={errorRef} className="ws-form-error" role="alert" tabIndex={-1}>
          {error}
        </div>
      ) : null}

      {blocked ? (
        <p className="ws-note ws-form-blocked">
          No {unavailable.join(", ")} records exist yet, and a requisition cannot be saved without them. Ask an
          administrator to add them to the organization records first.
        </p>
      ) : null}

      <p className="ws-muted ws-form-hint">Fields marked * are required.</p>

      {mode === "edit" ? <input type="hidden" name="requisitionId" value={requisitionId} /> : null}

      <fieldset className="ws-panel ws-form-fieldset">
        <legend className="ws-form-legend">Role</legend>
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
              The title candidates see. Keep client names out of it unless the client has approved being named.
            </span>
          </div>
          <LookupSelect
            id="positionId"
            label="Position"
            options={lookups.positions}
            value={initial?.positionId ?? ""}
            placeholder="Select a position"
            emptyLabel="No positions configured"
          />
          <EnumSelect
            id="careerArea"
            label="Career area"
            keys={CAREER_AREAS}
            labels={careerAreaLabels}
            value={initial?.careerArea ?? CREATE_DEFAULTS.careerArea}
          />
          <div className="apply-field">
            <label htmlFor="experienceLevel">Experience level</label>
            <select id="experienceLevel" name="experienceLevel" defaultValue={initial?.experienceLevel ?? ""}>
              <option value="">Not specified</option>
              {EXPERIENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
          <div className="apply-field">
            <label htmlFor="openings">Openings</label>
            <input
              id="openings"
              name="openings"
              type="number"
              min={1}
              max={999}
              step={1}
              inputMode="numeric"
              defaultValue={initial?.openings ?? CREATE_DEFAULTS.openings}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="ws-panel ws-form-fieldset">
        <legend className="ws-form-legend">Placement</legend>
        <div className="ws-form-grid">
          <LookupSelect
            id="departmentId"
            label="Department"
            options={lookups.departments}
            value={initial?.departmentId ?? ""}
            placeholder="Select a department"
            emptyLabel="No departments configured"
          />
          <LookupSelect
            id="locationId"
            label="Location"
            options={lookups.locations}
            value={initial?.locationId ?? ""}
            placeholder="Select a location"
            emptyLabel="No locations configured"
          />
          <EnumSelect
            id="employmentType"
            label="Employment type"
            keys={EMPLOYMENT_TYPES}
            labels={employmentTypeLabels}
            value={initial?.employmentType ?? CREATE_DEFAULTS.employmentType}
          />
          <EnumSelect
            id="workplaceType"
            label="Work arrangement"
            keys={WORKPLACE_TYPES}
            labels={workplaceTypeLabels}
            value={initial?.workplaceType ?? CREATE_DEFAULTS.workplaceType}
          />
        </div>
      </fieldset>

      <fieldset className="ws-panel ws-form-fieldset">
        <legend className="ws-form-legend">Compensation</legend>
        <p className="ws-muted ws-form-intro">
          Optional. Leave both blank until a range is approved — an empty range is published as &ldquo;not
          specified&rdquo;, never as zero.
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
            />
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
              rows={8}
              maxLength={8000}
              defaultValue={initial?.description ?? ""}
              aria-describedby="description-help"
            />
            <span id="description-help" className="ws-field-meta">
              Write only what the hiring team has approved.
            </span>
          </div>
          <ListField
            id="responsibilities"
            label="Key responsibilities"
            rows={6}
            value={initial?.responsibilities ?? []}
          />
          <ListField
            id="qualifications"
            label="Required qualifications"
            rows={6}
            value={initial?.qualifications ?? []}
          />
          <ListField
            id="preferredQualifications"
            label="Preferred qualifications"
            rows={4}
            value={initial?.preferredQualifications ?? []}
          />
          <ListField id="benefits" label="Benefits" rows={4} value={initial?.benefits ?? []} />
        </div>
      </fieldset>

      <fieldset className="ws-panel ws-form-fieldset">
        <legend className="ws-form-legend">Publishing</legend>
        <p className="ws-muted ws-form-intro">
          {mode === "create"
            ? "Saving creates a draft. Drafts are internal and never appear on the public careers site."
            : "Saving edits text and details only. Publishing and unpublishing stay separate actions on the requisition."}
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
              Optional. Applications close at the end of this day.
            </span>
          </div>
          {mode === "create" ? (
            <div className="ws-form-span ws-form-check">
              {/* Unchecked by default: nothing reaches the public site unless a
                  recruiter deliberately asks for it here. */}
              <input id="publishNow" name="publishNow" type="checkbox" />
              <span className="ws-form-check-text">
                <label htmlFor="publishNow">Publish immediately</label>
                <span className="ws-field-meta">
                  Leave this unchecked to keep the requisition as a draft you can review first.
                </span>
              </span>
            </div>
          ) : null}
        </div>
      </fieldset>

      <div className="ws-actions">
        <button type="submit" className="ws-btn primary" disabled={pending || blocked}>
          {pending
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
              ? "Create requisition"
              : "Save changes"}
        </button>
        <Link
          className="ws-btn"
          href={mode === "edit" && requisitionId ? `/app/recruiting/jobs/${requisitionId}` : "/app/recruiting/jobs"}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
