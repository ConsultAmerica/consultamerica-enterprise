import Link from "next/link";

import type { Job } from "@/lib/jobs/public-model";
import { formatPostedDate } from "@/lib/jobs/public-model";
import { safeExternalApplyUrl } from "@/lib/jobs/portal";

type JobDetailViewProps = {
  job: Job;
  /** Compact panel mode hides redundant chrome used on the full page. */
  compact?: boolean;
};

function SectionList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="job-section">
      <h2>{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function JobDetailView({ job, compact = false }: JobDetailViewProps) {
  const externalUrl =
    job.applicationType === "EXTERNAL"
      ? safeExternalApplyUrl(job.externalApplyUrl) ?? job.externalApplyUrl
      : null;
  const canApply = job.acceptingApplications;
  const about = job.description?.trim() || job.summary?.trim() || "";

  return (
    <article>
      {job.isNew ? (
        <div
          style={{
            fontFamily: '"Geist Mono", monospace',
            fontSize: 11,
            letterSpacing: "0.1em",
            color: "var(--blue)",
            marginBottom: 8,
          }}
        >
          NEW
        </div>
      ) : null}
      <h1 className="job-detail-title">{job.title}</h1>
      <p className="job-detail-meta">
        {job.company}
        <br />
        {job.location} · {job.workplaceType} · {job.employmentType}
        {job.experienceLevel ? ` · ${job.experienceLevel}` : ""}
        <br />
        Posted {formatPostedDate(job.postedAt)}
      </p>

      {canApply ? (
        <div className="job-detail-actions">
          {job.applicationType === "INTERNAL" ? (
            <Link href={`/jobs/${job.slug}/apply`} className="btn btn-primary">
              Easy Apply
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          ) : externalUrl ? (
            <a
              href={externalUrl}
              className="btn btn-primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              Apply Now ↗
            </a>
          ) : null}
          {!compact ? (
            <Link href="/jobs" className="btn btn-dark">
              Back to jobs
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="job-detail-actions">
          <Link href="/jobs" className="btn btn-dark">
            View open roles
          </Link>
        </div>
      )}

      {about ? (
        <section className="job-section">
          <h2>About the role</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{about}</p>
        </section>
      ) : null}

      {job.companySummary?.trim() ? (
        <section className="job-section">
          <h2>About {job.company}</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{job.companySummary}</p>
        </section>
      ) : null}

      <SectionList title="Responsibilities" items={job.responsibilities} />
      <SectionList title="Requirements" items={job.qualifications} />
      <SectionList
        title="Preferred qualifications"
        items={job.preferredQualifications ?? []}
      />

      {job.skills.length > 0 ? (
        <section className="job-section">
          <h2>Skills</h2>
          <p>{job.skills.join(" · ")}</p>
        </section>
      ) : null}

      {job.salaryLabel ? (
        <section className="job-section">
          <h2>Compensation</h2>
          <p>{job.salaryLabel}</p>
        </section>
      ) : null}

      <section className="job-section">
        <h2>Job ID</h2>
        <p>{job.requisitionId || job.id}</p>
      </section>
    </article>
  );
}
