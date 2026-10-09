import Link from "next/link";

import { JobRowActions } from "@/components/workspace/JobRowActions";
import { JobsFilters } from "@/components/workspace/JobsFilters";
import { fmtDate, humanize, oneParam } from "@/components/workspace/format";
import { recruitingRepository } from "@/lib/recruiting";
import { employmentTypeLabels, workplaceTypeLabels } from "@/types/organization";

export const metadata = { title: "Jobs" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * This list reads the requisition status, and setJobStatus persists publication
 * state there under different names: UNPUBLISHED becomes ON_HOLD and ARCHIVED
 * becomes CANCELLED (REQUISITION_STATUS_FOR in lib/recruiting/supabase-repository.ts).
 * Every group therefore accepts both spellings, so the filter keeps working if a
 * row ever carries the posting status instead.
 */
const STATUS_GROUPS: Record<string, string[]> = {
  draft: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "SCHEDULED"],
  published: ["PUBLISHED", "OPEN"],
  unpublished: ["UNPUBLISHED", "ON_HOLD", "PAUSED"],
  archived: ["ARCHIVED", "CANCELLED"],
  closed: ["CLOSED", "FILLED", "EXPIRED"],
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "unpublished", label: "Unpublished" },
  { value: "archived", label: "Archived" },
  { value: "closed", label: "Closed" },
];

/** Mirrors the jobs_public_read policy in db/schema/043_job_publication.sql. */
const PUBLIC_STATUSES = ["PUBLISHED", "OPEN"];

/**
 * A recruiter pressed "Unpublish" or "Archive"; the list says that back to them
 * rather than exposing the ON_HOLD/CANCELLED spelling the requisition row uses.
 */
const STATUS_LABELS: Record<string, string> = {
  ON_HOLD: "Unpublished",
  CANCELLED: "Archived",
};

/**
 * Publication state has to be readable at a glance: green means a visitor can
 * see this job right now, everything else cannot.
 */
function pillTone(status: string): string {
  if (PUBLIC_STATUSES.includes(status)) return "green";
  if (["DRAFT", "PENDING_APPROVAL", "SCHEDULED"].includes(status)) return "amber";
  if (["APPROVED", "FILLED"].includes(status)) return "blue";
  if (["REJECTED", "EXPIRED"].includes(status)) return "red";
  // Unpublished / archived / closed: off the site, but deliberately so.
  return "";
}

export default async function JobsPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = (oneParam(params.q) ?? "").trim();
  const statusFilter = (oneParam(params.status) ?? "all").toLowerCase();
  // An unknown ?status= value degrades to "all" rather than an empty screen.
  const statusGroup = STATUS_GROUPS[statusFilter];

  const jobs = await recruitingRepository.listJobSummaries();
  const needle = query.toLowerCase();
  const visible = jobs.filter((job) => {
    if (statusGroup && !statusGroup.includes(job.status)) return false;
    if (!needle) return true;
    return [job.title, job.requisitionNumber, job.departmentName].some((field) =>
      field.toLowerCase().includes(needle),
    );
  });

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Recruiting</p>
          <h1>Jobs &amp; requisitions</h1>
          <p>Every requisition, including drafts created from Job Intake. Drafts are not public until published.</p>
        </div>
        <Link className="ws-btn primary" href="/app/recruiting/jobs/new">
          New job
        </Link>
      </div>
      <section className="ws-panel">
        {jobs.length > 0 ? (
          <JobsFilters options={STATUS_OPTIONS} matchCount={visible.length} totalCount={jobs.length} />
        ) : null}

        {jobs.length === 0 ? (
          <div className="ws-empty">
            <h2>No jobs yet</h2>
            <p>
              Create the first requisition to start tracking applicants. You can save it as a draft and
              publish it whenever the description is ready.
            </p>
            <Link className="ws-btn primary" href="/app/recruiting/jobs/new">
              Create the first job
            </Link>
          </div>
        ) : visible.length === 0 ? (
          <div className="ws-empty">
            <h2>No jobs match this filter</h2>
            <p>
              {query ? (
                <>
                  Nothing matches &ldquo;{query}&rdquo;{statusGroup ? " in this status" : ""}.{" "}
                </>
              ) : (
                <>No requisitions are in this status. </>
              )}
              Clear the filter to see all {jobs.length} requisitions.
            </p>
            <Link className="ws-btn" href="/app/recruiting/jobs">
              Clear filters
            </Link>
          </div>
        ) : (
          <>
            <div className="ws-table-wrap">
              <table className="ws-table">
                <thead>
                  <tr>
                    <th>Requisition</th>
                    <th>Department</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Applicants</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((j) => {
                    const isPublic = PUBLIC_STATUSES.includes(j.status);
                    return (
                      <tr key={j.requisitionId}>
                        <td>
                          <Link href={`/app/recruiting/jobs/${j.requisitionId}`}>{j.title}</Link>
                          <div className="ws-muted">
                            {j.requisitionNumber} · {employmentTypeLabels[j.employmentType] ?? j.employmentType} · {workplaceTypeLabels[j.workplaceType] ?? j.workplaceType}
                          </div>
                        </td>
                        <td>{j.departmentName}</td>
                        <td>{j.locationName}</td>
                        <td>
                          <span
                            className={`ws-pill ${pillTone(j.status)}${isPublic ? " live" : ""}`}
                            title={isPublic ? "Live on the public careers site" : "Internal only"}
                          >
                            {STATUS_LABELS[j.status] ?? humanize(j.status)}
                          </span>
                        </td>
                        <td>{j.candidateCount}</td>
                        <td className="ws-muted">{fmtDate(j.updatedAt)}</td>
                        <td>
                          <JobRowActions requisitionId={j.requisitionId} status={j.status} title={j.title} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="ws-table-caption">
              Only Published and Open requisitions appear on the public careers site. Draft, unpublished,
              archived and closed jobs stay internal to this workspace.
            </p>
          </>
        )}
      </section>
    </>
  );
}
