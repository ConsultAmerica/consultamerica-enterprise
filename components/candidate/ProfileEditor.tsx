"use client";

import type { DetailedProfile } from "@/lib/recruiting/detailed-profile";

type Experience = DetailedProfile["experience"][number];
type Education = DetailedProfile["education"][number];

export type ProfileDraft = {
  summary: string;
  skills: string;
  experience: Experience[];
  education: Education[];
  certifications: string;
};

export const EMPTY_EXPERIENCE: Experience = { title: "", company: "", startDate: "", endDate: "", isCurrent: false };
export const EMPTY_EDUCATION: Education = { institution: "", degree: "", fieldOfStudy: "", endDate: "" };

export const splitList = (v: string) => v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

export function toProfileDraft(p: DetailedProfile): ProfileDraft {
  return {
    summary: p.summary ?? "",
    skills: p.skills.join(", "),
    experience: p.experience.map((e) => ({ ...e })),
    education: p.education.map((e) => ({ ...e })),
    certifications: p.certifications.join("\n"),
  };
}

export function fromProfileDraft(d: ProfileDraft, portfolioUrl = ""): DetailedProfile {
  return {
    summary: d.summary.trim(),
    skills: splitList(d.skills),
    experience: d.experience.filter((e) => e.title.trim()),
    education: d.education.filter((e) => e.institution.trim() || e.degree.trim()),
    certifications: splitList(d.certifications),
    portfolioUrl,
  };
}

/** Editable professional profile: summary, skills, experience, education, certifications. */
export function ProfileEditor({ value, onChange, idPrefix }: { value: ProfileDraft; onChange: (next: ProfileDraft) => void; idPrefix: string }) {
  const set = <K extends keyof ProfileDraft>(key: K, v: ProfileDraft[K]) => onChange({ ...value, [key]: v });
  const setExp = (i: number, patch: Partial<Experience>) =>
    set("experience", value.experience.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setEdu = (i: number, patch: Partial<Education>) =>
    set("education", value.education.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const id = (s: string) => `${idPrefix}-${s}`;

  return (
    <>
      <div className="apply-field">
        <label htmlFor={id("summary")}>Professional summary (optional)</label>
        <textarea id={id("summary")} rows={3} value={value.summary} onChange={(e) => set("summary", e.target.value)} />
      </div>
      <div className="apply-field">
        <label htmlFor={id("skills")}>Skills (comma separated)</label>
        <textarea id={id("skills")} rows={2} value={value.skills} onChange={(e) => set("skills", e.target.value)} />
      </div>

      <h3 className="apply-sub-heading">Work experience</h3>
      {value.experience.map((e, i) => (
        <div key={i} className="apply-repeat">
          <div className="apply-grid-2">
            <Field id={id(`exp-title-${i}`)} label="Job title" value={e.title} onChange={(v) => setExp(i, { title: v })} />
            <Field id={id(`exp-company-${i}`)} label="Company" value={e.company} onChange={(v) => setExp(i, { company: v })} />
            <Field id={id(`exp-start-${i}`)} label="Start (YYYY-MM)" value={e.startDate} onChange={(v) => setExp(i, { startDate: v })} />
            <Field
              id={id(`exp-end-${i}`)}
              label="End (YYYY-MM)"
              value={e.isCurrent ? "" : e.endDate}
              disabled={e.isCurrent}
              onChange={(v) => setExp(i, { endDate: v })}
            />
          </div>
          <div className="apply-repeat-actions">
            <label>
              <input type="checkbox" checked={e.isCurrent} onChange={(ev) => setExp(i, { isCurrent: ev.target.checked })} /> Current role
            </label>
            <button type="button" className="apply-text-btn" onClick={() => set("experience", value.experience.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="apply-text-btn" onClick={() => set("experience", [...value.experience, { ...EMPTY_EXPERIENCE }])}>
        + Add experience
      </button>

      <h3 className="apply-sub-heading">Education</h3>
      {value.education.map((e, i) => (
        <div key={i} className="apply-repeat">
          <div className="apply-grid-2">
            <Field id={id(`edu-inst-${i}`)} label="Institution" value={e.institution} onChange={(v) => setEdu(i, { institution: v })} />
            <Field id={id(`edu-degree-${i}`)} label="Degree" value={e.degree} onChange={(v) => setEdu(i, { degree: v })} />
            <Field id={id(`edu-field-${i}`)} label="Field of study" value={e.fieldOfStudy} onChange={(v) => setEdu(i, { fieldOfStudy: v })} />
            <Field id={id(`edu-end-${i}`)} label="Completed (year)" value={e.endDate} onChange={(v) => setEdu(i, { endDate: v })} />
          </div>
          <div className="apply-repeat-actions">
            <span />
            <button type="button" className="apply-text-btn" onClick={() => set("education", value.education.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="apply-text-btn" onClick={() => set("education", [...value.education, { ...EMPTY_EDUCATION }])}>
        + Add education
      </button>

      <div className="apply-field" style={{ marginTop: 16 }}>
        <label htmlFor={id("certifications")}>Certifications (one per line)</label>
        <textarea id={id("certifications")} rows={3} value={value.certifications} onChange={(e) => set("certifications", e.target.value)} />
      </div>
    </>
  );
}

function Field(props: { id: string; label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="apply-field">
      <label htmlFor={props.id}>{props.label}</label>
      <input id={props.id} type="text" value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}
