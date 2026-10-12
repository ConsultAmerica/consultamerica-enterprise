"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { setStageBulkAction } from "@/app/admin/applications/actions";
import { Avatar } from "@/components/admin/Avatar";
import { ResumeLink } from "@/components/admin/ResumeLink";
import type { ApplicationStatus } from "@/lib/neon/types";

/**
 * The applications queue: sortable, selectable, and movable in bulk.
 *
 * WHY THIS IS A CLIENT COMPONENT AND THE PAGE AROUND IT IS NOT. Selection is
 * the only state here, and it is genuinely ephemeral — nobody wants their
 * ticked boxes restored from a URL a week later. Sorting, by contrast, lives in
 * the query string: a recruiter who sorts by stage and sends the link to a
 * colleague should be sending the view they are looking at. So selection is
 * useState and sorting is a navigation, and the rows themselves are still read
 * and ordered by Postgres.
 *
 * SORTING IS A SERVER ROUND TRIP, NOT AN ARRAY SORT. The page renders at most
 * 100 of what may be thousands of applications. Sorting the array in the
 * browser would reorder the page and call it the queue, which is wrong in
 * exactly the situation that matters — a backlog longer than one page. The
 * header links set ?sort= and ?dir= and let the database do it.
 */

export type ApplicationRowView = {
  id: string;
  reference: string;
  status: ApplicationStatus;
  appliedLabel: string;
  appliedIso?: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  jobReference: string;
  resumeUrl: string | null;
  resumeFilename: string | null;
  resumeSizeBytes: number | null;
};

type Props = {
  rows: ApplicationRowView[];
  /** Stage options for the bulk control, in pipeline order. */
  stages: ReadonlyArray<{ value: ApplicationStatus; label: string }>;
  /** Rendered per row; the page owns stage colours so both tables agree. */
  stageTone: Record<ApplicationStatus, string>;
  stageLabel: Record<ApplicationStatus, string>;
};

const SORTABLE = [
  { key: "candidate", label: "Applicant" },
  { key: "role", label: "Role applied for" },
  { key: "stage", label: "Stage" },
  { key: "applied", label: "Applied" },
] as const;

const CARET = (up: boolean) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {up ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
  </svg>
);

export function ApplicationsTable({ rows, stages, stageTone, stageLabel }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState<string>("");
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const sort = params.get("sort") ?? "applied";
  const dir = params.get("dir") === "asc" ? "asc" : "desc";

  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  /* Indeterminate, not "some": the header box has three states and the middle
     one is what tells you a selection exists below the fold. */
  const someSelected = selected.size > 0 && !allSelected;

  /** A header link that flips direction when it is already the active column. */
  const sortHref = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("sort", key);
    next.set("dir", sort === key && dir === "desc" ? "asc" : "desc");
    return `/admin/applications?${next.toString()}`;
  };

  const toggle = (id: string) => {
    setMessage(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setMessage(null);
    setSelected((current) => (current.size === ids.length ? new Set() : new Set(ids)));
  };

  const applyBulk = () => {
    if (!bulkStage || selected.size === 0) return;
    setMessage(null);
    const chosen = Array.from(selected);
    startTransition(async () => {
      const result = await setStageBulkAction(chosen, bulkStage);
      if (!result.ok) {
        setMessage({ tone: "err", text: result.error });
        return;
      }
      /* The count comes from the server, not from how many boxes were ticked.
         If three of ten were deleted in another tab the recruiter is told so
         rather than being shown a cheerful ten. */
      const label = stages.find((s) => s.value === bulkStage)?.label ?? bulkStage;
      setMessage({
        tone: "ok",
        text:
          result.failed && result.failed > 0
            ? `${result.moved} moved to ${label}. ${result.failed} could not be moved and may have been deleted elsewhere.`
            : `${result.moved} ${result.moved === 1 ? "application" : "applications"} moved to ${label}.`,
      });
      setSelected(new Set());
      setBulkStage("");
      router.refresh();
    });
  };

  return (
    <>
      {/*
        The bulk bar exists only when something is selected. A permanently
        visible toolbar of controls that do nothing is the commonest way an
        enterprise table starts feeling heavy.
      */}
      {selected.size > 0 ? (
        <div className="apb" role="region" aria-label="Bulk actions">
          <span className="apb-count">
            {selected.size} selected
          </span>
          <label className="apb-field">
            <span className="sr-only">Move selected applications to stage</span>
            <select
              value={bulkStage}
              disabled={pending}
              onChange={(event) => setBulkStage(event.target.value)}
            >
              <option value="">Move to stage…</option>
              {stages.map((stage) => (
                <option key={stage.value} value={stage.value}>
                  {stage.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="apb-apply"
            disabled={pending || !bulkStage}
            onClick={applyBulk}
          >
            {pending ? "Moving…" : "Apply"}
          </button>
          <button
            type="button"
            className="apb-clear"
            disabled={pending}
            onClick={() => {
              setSelected(new Set());
              setMessage(null);
            }}
          >
            Clear
          </button>
        </div>
      ) : null}

      {message ? (
        <p className={`apb-msg ${message.tone}`} role="status">
          {message.text}
        </p>
      ) : null}

      <div className="ws-table-wrap">
        <table className="ws-table ap-table">
          <thead>
            <tr>
              <th className="ap-check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(node) => {
                    if (node) node.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  aria-label={allSelected ? "Clear selection" : "Select all on this page"}
                />
              </th>
              {SORTABLE.map((column) => {
                const active = sort === column.key;
                return (
                  <th key={column.key} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                    <Link
                      className={`ap-sort${active ? " is-active" : ""}`}
                      href={sortHref(column.key)}
                      scroll={false}
                    >
                      {column.label}
                      <span className="ap-caret">{active ? CARET(dir === "asc") : CARET(false)}</span>
                    </Link>
                  </th>
                );
              })}
              {/* Résumé is not sortable: "ordered by filename" answers nothing
                  anyone has ever needed to ask. */}
              <th>Resume</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={selected.has(row.id) ? "is-selected" : ""}>
                <td className="ap-check">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                    aria-label={`Select ${row.candidateName}`}
                  />
                </td>
                <td>
                  <span className="ws-who">
                    <Avatar name={row.candidateName} seed={row.candidateEmail} />
                    <span className="ws-who-text">
                      <Link href={`/admin/applications/${row.id}`}>{row.candidateName}</Link>
                      <div className="ws-muted">{row.candidateEmail}</div>
                      <div className="ws-muted">{row.reference}</div>
                    </span>
                  </span>
                </td>
                <td>
                  {row.jobTitle}
                  <div className="ws-muted">{row.jobReference}</div>
                </td>
                <td>
                  <span className={`ws-pill ${stageTone[row.status]}`.trim()}>
                    {stageLabel[row.status]}
                  </span>
                </td>
                <td className="ws-muted" title={row.appliedIso}>
                  {row.appliedLabel}
                </td>
                <td className="ca-resume-cell">
                  {/* No extra query per row: listApplications already selects
                      resume_url, filename and size, so the column is paid for
                      by the read that was happening anyway. */}
                  <ResumeLink
                    applicationId={row.id}
                    resumeUrl={row.resumeUrl}
                    filename={row.resumeFilename}
                    sizeBytes={row.resumeSizeBytes}
                    showSize={false}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
