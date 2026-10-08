import Link from "next/link";

import { SyncIntakeButton } from "@/components/workspace/SyncIntakeButton";
import { fmtDate, humanize, oneParam } from "@/components/workspace/format";
import { fieldText } from "@/lib/email-intake/extraction";
import { getIntakeRuntime } from "@/lib/email-intake/runtime";
import type { IntakeStatus } from "@/lib/email-intake/types";

export const metadata = { title: "Job Intake" };

const TABS: { id: string; label: string; statuses: IntakeStatus[] }[] = [
  { id: "review", label: "Needs review", statuses: ["REVIEW_REQUIRED", "FAILED", "RECEIVED", "PROCESSING"] },
  { id: "drafted", label: "Drafted", statuses: ["DRAFTED", "LINKED"] },
  { id: "ignored", label: "Ignored", statuses: ["IGNORED", "NOT_A_JOB"] },
  { id: "all", label: "All", statuses: ["RECEIVED", "PROCESSING", "REVIEW_REQUIRED", "DRAFTED", "LINKED", "IGNORED", "NOT_A_JOB", "FAILED"] },
];

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function JobIntakePage({ searchParams }: Props) {
  const tabId = oneParam((await searchParams).tab) ?? "review";
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0];

  let runtime;
  try {
    runtime = getIntakeRuntime();
  } catch (error) {
    return <IntakeUnavailable reason={error instanceof Error ? error.message : "Job intake is not configured."} />;
  }

  let items;
  let counts;
  try {
    [items, counts] = await Promise.all([runtime.repo.list(tab.statuses, 100), runtime.repo.countByStatus()]);
  } catch {
    return <IntakeUnavailable reason="The job intake tables are not available yet (migration 045 has not been applied)." />;
  }
  const countFor = (t: (typeof TABS)[number]) => t.statuses.reduce((n, s) => n + (counts[s] ?? 0), 0);

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Recruiting · {runtime.config.mode === "mock" ? "Mock mailbox (development)" : runtime.config.mode === "zoho" ? "Zoho Mail" : "Mailbox not connected"}</p>
          <h1>Job intake</h1>
          <p>Job requirements received by email. Nothing here is public: approving an item creates a draft requisition for you to edit and publish separately.</p>
        </div>
        <SyncIntakeButton enabled={Boolean(runtime.provider)} />
      </div>

      <nav className="ws-tabs" aria-label="Intake status">
        {TABS.map((t) => (
          <Link key={t.id} href={`/app/recruiting/job-intake?tab=${t.id}`} aria-current={t.id === tab.id ? "page" : undefined}>
            {t.label} ({countFor(t)})
          </Link>
        ))}
      </nav>

      <section className="ws-panel">
        {items.length ? (
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>AI extracted</th>
                  <th>Classification</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => {
                  const f = m.extraction?.fields;
                  const extracted = [fieldText(f?.location), fieldText(f?.workArrangement), fieldText(f?.employmentType)].filter(Boolean);
                  return (
                    <tr key={m.id}>
                      <td>
                        <Link href={`/app/recruiting/job-intake/${m.id}`}>{fieldText(f?.title) || m.subject || "(no subject)"}</Link>
                        <div className="ws-muted">
                          {m.fromName || m.fromAddress} · {fmtDate(m.receivedAt)}
                          {m.subject && fieldText(f?.title) ? ` · “${m.subject}”` : ""}
                        </div>
                      </td>
                      <td className="ws-muted">{extracted.length ? extracted.join(" · ") : "—"}</td>
                      <td>
                        {m.classification ? <span className="ws-pill">{humanize(m.classification)}</span> : <span className="ws-muted">Pending</span>}
                        {m.duplicateSignals.length ? (
                          <div style={{ marginTop: 4 }}>
                            <span className="ws-pill amber">Possible duplicate</span>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`ws-pill ${m.processingStatus === "FAILED" ? "red" : m.processingStatus === "DRAFTED" ? "green" : ""}`}>
                          {humanize(m.processingStatus)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ws-muted">Nothing here.</p>
        )}
      </section>
    </>
  );
}

function IntakeUnavailable({ reason }: { reason: string }) {
  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Recruiting</p>
          <h1>Job intake</h1>
        </div>
      </div>
      <section className="ws-panel">
        <p>{reason}</p>
      </section>
    </>
  );
}
