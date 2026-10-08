import Link from "next/link";
import { notFound } from "next/navigation";

import { IntakeReviewForm, type ReviewField } from "@/components/workspace/IntakeReviewForm";
import { fmtDate, humanize } from "@/components/workspace/format";
import { fieldText } from "@/lib/email-intake/extraction";
import { getIntakeRuntime } from "@/lib/email-intake/runtime";
import { EXTRACTION_FIELDS, FIELD_LABELS, LIST_FIELDS, type ExtractionFieldKey } from "@/lib/email-intake/types";

type Props = { params: Promise<{ intakeId: string }> };

const MULTILINE = new Set<ExtractionFieldKey>(["description", ...LIST_FIELDS]);
// Fields shown in the review form, most useful first.
const ORDER: ExtractionFieldKey[] = [
  "title", "location", "workArrangement", "employmentType", "contractType", "duration", "compensation",
  "minimumExperience", "experienceLevel", "requiredSkills", "preferredSkills", "responsibilities", "description",
  "education", "certifications", "workAuthorization", "startDate", "applicationDeadline", "requestedPublishDate",
  "clientReference", "recruiter", "hiringManager",
];

export default async function IntakeReviewPage({ params }: Props) {
  const { intakeId } = await params;
  const runtime = getIntakeRuntime();
  const intake = await runtime.repo.get(intakeId);
  if (!intake) notFound();
  const [events, thread, ref] = await Promise.all([
    runtime.repo.listEvents(intakeId),
    intake.providerThreadId ? runtime.repo.listThread(intake.provider, intake.providerAccountId, intake.providerThreadId) : Promise.resolve([]),
    runtime.referenceData(),
  ]);
  const others = thread.filter((m) => m.id !== intake.id).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const f = intake.extraction?.fields;

  const fields: ReviewField[] = ORDER.filter((k) => EXTRACTION_FIELDS.includes(k)).map((key) => {
    const extracted = f?.[key] ?? null;
    const draft = intake.reviewDraft?.[key];
    const value = draft ?? (Array.isArray(extracted?.value) ? extracted.value.join("\n") : fieldText(extracted ?? undefined));
    return { key, label: FIELD_LABELS[key], value, multiline: MULTILINE.has(key), extracted };
  });

  const arrangement = fieldText(f?.workArrangement).toLowerCase();
  const employment = fieldText(f?.employmentType).toLowerCase();
  const suggested = {
    workplaceType: arrangement.includes("remote") ? "REMOTE" : arrangement.includes("site") ? "ONSITE" : "HYBRID",
    employmentType: employment.includes("contract") ? "CONTRACT" : employment.includes("part") ? "PART_TIME" : "FULL_TIME",
    careerArea: /oracle|oic|fusion|erp/i.test(fieldText(f?.title) + fieldText(f?.requiredSkills)) ? "technology-oracle" : /data|ai|ml/i.test(fieldText(f?.title)) ? "ai-data" : "consulting",
  };

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">
            <Link href="/app/recruiting/job-intake">Job intake</Link> · {humanize(intake.processingStatus)}
          </p>
          <h1>{intake.subject || "(no subject)"}</h1>
          <p>
            {intake.classification ? (
              <>
                <span className="ws-pill">{humanize(intake.classification)}</span>{" "}
                <span className="ws-muted">
                  {intake.classificationSource === "AI" ? "AI-assisted" : intake.classificationSource === "RECRUITER" ? "Recruiter" : "Rules"}
                  {intake.classificationConfidence !== null ? ` · ${Math.round(intake.classificationConfidence * 100)}%` : ""}
                  {intake.extractionModel ? ` · extracted by ${intake.extractionModel}` : ""}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="ws-grid">
        <div>
          <section className="ws-panel">
            <h2>Source email</h2>
            <dl className="ws-dl" style={{ marginBottom: 12 }}>
              <dt>From</dt>
              <dd>{intake.fromName ? `${intake.fromName} <${intake.fromAddress}>` : intake.fromAddress}</dd>
              <dt>Received</dt>
              <dd>{new Date(intake.receivedAt).toLocaleString("en-US")}</dd>
              <dt>Mailbox</dt>
              <dd>{intake.provider === "mock" ? "Mock mailbox" : "Zoho Mail"} · message {intake.providerMessageId}</dd>
            </dl>
            <div className="ws-source">{intake.normalizedText ?? "Not processed yet."}</div>
            {intake.attachments.length ? (
              <>
                <h3>Attachments</h3>
                <ul className="ws-list">
                  {intake.attachments.map((a) => (
                    <li key={a.providerAttachmentId}>
                      {a.name} <span className="ws-muted">· {Math.ceil(a.size / 1024)} KB</span>{" "}
                      <span className={`ws-pill ${a.status === "EXTRACTED" ? "green" : a.status === "FAILED" || a.status === "REJECTED" ? "amber" : ""}`}>{humanize(a.status)}</span>
                      {a.reason ? <span className="ws-muted"> · {a.reason}</span> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {intake.lastError ? <p className="ws-note">Processing error: {intake.lastError}</p> : null}
            <p className="ws-note">Email content is treated as untrusted data. Instructions inside an email (for example “publish this job”) have no effect.</p>
          </section>

          {others.length ? (
            <section className="ws-panel">
              <h2>Same email thread</h2>
              <p className="ws-muted">Later messages may amend this requirement. Approved requisitions are never changed automatically.</p>
              <ul className="ws-list">
                {others.map((m) => (
                  <li key={m.id}>
                    <Link href={`/app/recruiting/job-intake/${m.id}`}>{m.subject || "(no subject)"}</Link>
                    <div className="ws-muted">
                      {fmtDate(m.receivedAt)} · {m.classification ? humanize(m.classification) : "pending"} · {humanize(m.processingStatus)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="ws-panel">
            <h2>Activity</h2>
            <ul className="ws-list">
              {events.slice(0, 20).map((e) => (
                <li key={e.id}>
                  {humanize(e.eventType)} <span className="ws-muted">· {e.actorType === "SYSTEM" ? "system" : "recruiter"} · {new Date(e.createdAt).toLocaleString("en-US")}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="ws-panel">
          <h2>Extracted job fields</h2>
          {intake.extraction?.warnings.length ? <p className="ws-note">{intake.extraction.warnings.join(" ")}</p> : null}
          <IntakeReviewForm
            intakeId={intake.id}
            status={intake.processingStatus}
            fields={fields}
            duplicates={intake.duplicateSignals.map((d) => ({ kind: d.kind, detail: d.detail }))}
            linkedRequisitionId={intake.linkedRequisitionId}
            departments={ref.departments}
            locations={ref.locations}
            positions={ref.positions}
            requisitions={ref.requisitions}
            suggested={suggested}
          />
        </section>
      </div>
    </>
  );
}
