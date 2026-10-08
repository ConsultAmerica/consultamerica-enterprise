"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import {
  approveIntakeAction,
  dismissIntakeAction,
  linkIntakeAction,
  saveIntakeDraftAction,
  type ActionResult,
} from "@/app/actions/job-intake";
import type { ExtractedField, ExtractionFieldKey } from "@/lib/email-intake/types";

type Option = { id: string; name: string };

export type ReviewField = {
  key: ExtractionFieldKey;
  label: string;
  value: string;
  multiline: boolean;
  extracted: ExtractedField | null;
};

type Props = {
  intakeId: string;
  status: string;
  fields: ReviewField[];
  duplicates: { kind: string; detail: string }[];
  linkedRequisitionId: string | null;
  departments: Option[];
  locations: Option[];
  positions: (Option & { departmentId: string })[];
  requisitions: Option[];
  suggested: { employmentType: string; workplaceType: string; careerArea: string };
};

const STATUS_TONE: Record<string, string> = { EXPLICIT: "green", INFERRED: "amber", MISSING: "" };

export function IntakeReviewForm(props: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [departmentId, setDepartmentId] = useState(props.departments[0]?.id ?? "");
  const done = ["DRAFTED", "LINKED"].includes(props.status);

  const run = (action: (form: FormData) => Promise<ActionResult>) => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    start(async () => setResult(await action(data)));
  };

  const requisitionId = (result?.ok && result.requisitionId) || props.linkedRequisitionId;

  return (
    <form ref={formRef} className="ws-form" onSubmit={(e) => e.preventDefault()}>
      {props.fields.map((f) => (
        <div key={f.key} className="apply-field">
          <label htmlFor={`field_${f.key}`}>{f.label}</label>
          {f.multiline ? (
            <textarea id={`field_${f.key}`} name={`field_${f.key}`} defaultValue={f.value} rows={f.key === "description" ? 5 : 3} disabled={done} />
          ) : (
            <input id={`field_${f.key}`} name={`field_${f.key}`} defaultValue={f.value} disabled={done} />
          )}
          <span className="ws-field-meta">
            {f.extracted && f.extracted.status !== "MISSING" ? (
              <>
                <span className={`ws-pill ${STATUS_TONE[f.extracted.status]}`}>{f.extracted.status === "EXPLICIT" ? "Stated in email" : "Inferred — verify"}</span>{" "}
                {f.extracted.source ? `from ${f.extracted.source}` : ""}
                {f.extracted.confidence !== null ? ` · confidence ${Math.round(f.extracted.confidence * 100)}%` : ""}
                {f.extracted.evidence ? (
                  <>
                    {" · "}
                    <q>{f.extracted.evidence.slice(0, 180)}</q>
                  </>
                ) : null}
              </>
            ) : (
              <span className="ws-pill">Not in email</span>
            )}
          </span>
        </div>
      ))}

      {done ? null : (
        <>
          <h3>Requisition details (required to create a draft)</h3>
          <div className="apply-grid-2">
            <div className="apply-field">
              <label htmlFor="departmentId">Department</label>
              <select id="departmentId" name="departmentId" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                {props.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="apply-field">
              <label htmlFor="positionId">Position</label>
              <select id="positionId" name="positionId">
                {props.positions.filter((p) => p.departmentId === departmentId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="apply-field">
              <label htmlFor="locationId">Location</label>
              <select id="locationId" name="locationId">
                {props.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="apply-field">
              <label htmlFor="careerArea">Career area</label>
              <select id="careerArea" name="careerArea" defaultValue={props.suggested.careerArea}>
                <option value="technology-oracle">Technology &amp; Oracle</option>
                <option value="ai-data">AI &amp; Data</option>
                <option value="consulting">Consulting</option>
                <option value="experienced-professionals">Experienced Professionals</option>
                <option value="early-careers">Early Careers</option>
              </select>
            </div>
            <div className="apply-field">
              <label htmlFor="employmentType">Employment type</label>
              <select id="employmentType" name="employmentType" defaultValue={props.suggested.employmentType}>
                <option value="FULL_TIME">Full time</option>
                <option value="CONTRACT">Contract</option>
                <option value="PART_TIME">Part time</option>
                <option value="TEMPORARY">Temporary</option>
              </select>
            </div>
            <div className="apply-field">
              <label htmlFor="workplaceType">Work arrangement</label>
              <select id="workplaceType" name="workplaceType" defaultValue={props.suggested.workplaceType}>
                <option value="HYBRID">Hybrid</option>
                <option value="REMOTE">Remote</option>
                <option value="ONSITE">On-site</option>
              </select>
            </div>
          </div>
          <div className="apply-field">
            <label htmlFor="qualifications">Additional qualifications (one per line)</label>
            <textarea id="qualifications" name="qualifications" rows={3} />
          </div>

          {props.duplicates.length ? (
            <div className="ws-note" style={{ background: "#fdf3df", color: "#5d3d00" }}>
              <strong>Possible duplicate</strong>
              <ul style={{ margin: "6px 0 8px 18px" }}>
                {props.duplicates.map((d, i) => <li key={i}>{d.detail}</li>)}
              </ul>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="acknowledgeDuplicates" /> I reviewed these and this is a separate requirement.
              </label>
            </div>
          ) : null}

          <div className="ws-actions">
            <button type="button" className="ws-btn primary" disabled={pending} onClick={() => run((f) => approveIntakeAction(props.intakeId, f))}>
              Approve as draft requisition
            </button>
            <button type="button" className="ws-btn" disabled={pending} onClick={() => run((f) => saveIntakeDraftAction(props.intakeId, f))}>
              Save edits
            </button>
            <button type="button" className="ws-btn" disabled={pending} onClick={() => run((f) => dismissIntakeAction(props.intakeId, "NOT_A_JOB", f))}>
              Not a job
            </button>
            <button type="button" className="ws-btn" disabled={pending} onClick={() => run((f) => dismissIntakeAction(props.intakeId, "IGNORED", f))}>
              Ignore
            </button>
          </div>

          <h3>Or link to an existing requisition</h3>
          <div className="ws-actions" style={{ marginTop: 0, alignItems: "center" }}>
            <select name="requisitionId" aria-label="Requisition" style={{ maxWidth: 360 }} className="ws-btn">
              {props.requisitions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button type="button" className="ws-btn" disabled={pending || !props.requisitions.length} onClick={() => run((f) => linkIntakeAction(props.intakeId, f))}>
              Link (does not change the requisition)
            </button>
          </div>
        </>
      )}

      {result ? <p className={`ws-flash ${result.ok ? "ok" : "err"}`}>{result.ok ? result.message : result.error}</p> : null}
      {requisitionId ? (
        <div className="ws-actions">
          <Link className="ws-btn" href={`/app/recruiting/jobs/${requisitionId}`}>Open requisition</Link>
          <Link className="ws-btn primary" href={`/app/recruiting/jobs/${requisitionId}?tab=matches`}>Find existing candidates</Link>
        </div>
      ) : null}
    </form>
  );
}
