import Link from "next/link";
import type { ReactNode } from "react";

import { CONSULTHIRE_BOT, buildJobSections, daysUntil } from "@/lib/jobs/detail";
import type { Job } from "@/lib/jobs/public-model";
import { formatPostedDate } from "@/lib/jobs/public-model";
import { safeExternalApplyUrl } from "@/lib/jobs/portal";

type JobDetailViewProps = {
  job: Job;
  /** Listing preview (/jobs selected panel): no breadcrumb, no related jobs, link to the full page. */
  compact?: boolean;
  /** Full page only: other open roles to suggest. */
  related?: Job[];
  /** Full page only: extra controls for the apply panel (e.g. Save job). */
  panelExtra?: ReactNode;
};

const ARROW = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const BOT_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M12 8V4M9 4h6" />
    <circle cx="9" cy="14" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="14" r="1.2" fill="currentColor" stroke="none" />
    <path d="M2 13v3M22 13v3" />
  </svg>
);

const EXTERNAL_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

/** Secondary CTA to the ConsultHire bot. A plain link: nothing about the visitor is added to the URL. */
export function ConsultHireBotLink({ className = "btn btn-dark jd-bot" }: { className?: string }) {
  return (
    <a
      href={CONSULTHIRE_BOT.href}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${CONSULTHIRE_BOT.label} (opens ConsultHire in a new tab)`}
    >
      {BOT_ICON}
      {CONSULTHIRE_BOT.label}
      {EXTERNAL_ICON}
    </a>
  );
}

function ApplyActions({ job }: { job: Job }) {
  if (!job.acceptingApplications) {
    return (
      <div className="jd-actions">
        <p className="jd-closed">This role is no longer accepting applications.</p>
        <Link href="/jobs" className="btn btn-dark">
          View open roles
        </Link>
      </div>
    );
  }
  const externalUrl = job.applicationType === "EXTERNAL" ? safeExternalApplyUrl(job.externalApplyUrl) : null;
  return (
    <div className="jd-actions">
      {job.applicationType === "INTERNAL" ? (
        <Link href={`/jobs/${job.slug}/apply`} className="btn btn-primary">
          Easy Apply {ARROW}
        </Link>
      ) : externalUrl ? (
        <a href={externalUrl} className="btn btn-primary" target="_blank" rel="noopener noreferrer">
          Apply Now {EXTERNAL_ICON}
        </a>
      ) : null}
      <ConsultHireBotLink />
      <p className="jd-bot-note">{CONSULTHIRE_BOT.note}</p>
    </div>
  );
}

function Facts({ job, compact }: { job: Job; compact: boolean }) {
  const closesIn = daysUntil(job.closesAt);
  const rows: [string, ReactNode][] = [
    ["Reference", job.referenceNumber],
    ["Location", job.location],
    ["Work arrangement", job.workplaceType],
    ["Employment type", job.employmentType],
  ];
  if (job.experienceLevel) rows.push(["Level", job.experienceLevel]);
  rows.push(["Posted", formatPostedDate(job.postedAt)]);
  if (job.closesAt) {
    rows.push([
      "Closes",
      <>
        {formatPostedDate(job.closesAt)}
        {closesIn !== null && closesIn >= 0 && closesIn <= 14 ? (
          <span className="jd-soon"> · {closesIn === 0 ? "today" : `${closesIn} day${closesIn === 1 ? "" : "s"} left`}</span>
        ) : null}
      </>,
    ]);
  }
  if (job.salaryLabel) rows.push(["Compensation", job.salaryLabel]);
  return (
    <dl className={`jd-facts${compact ? " jd-facts-compact" : ""}`}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
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

/** What actually happens after Easy Apply in this system — nothing more is promised. */
function ApplicationProcess({ job }: { job: Job }) {
  if (!job.acceptingApplications) return null;
  return (
    <section className="job-section">
      <h2>Hiring and application process</h2>
      {job.applicationType === "INTERNAL" ? (
        <ol className="jd-steps">
          <li>
            <strong>Apply.</strong> Easy Apply takes your contact details and résumé in a few minutes; no account is
            needed.
          </li>
          <li>
            <strong>Review.</strong> Our recruiting team reviews your application against the requirements above.
          </li>
          <li>
            <strong>Next steps.</strong> If your background aligns with the role, the team may contact you about next
            steps. You&apos;ll also get an email to activate a candidate account where you can follow your applications.
          </li>
        </ol>
      ) : (
        <p>Applications for this role are handled on the employer&apos;s own site through Apply Now.</p>
      )}
    </section>
  );
}

export function JobDetailView({ job, compact = false, related = [], panelExtra }: JobDetailViewProps) {
  const s = buildJobSections(job);
  const hasExperience = s.minimumYears !== null || s.education.length > 0;

  const header = (
    <header className="jd-head">
      {job.isNew ? <div className="jd-new">NEW</div> : null}
      {compact ? <h2 className="job-detail-title">{job.title}</h2> : <h1 className="job-detail-title">{job.title}</h1>}
      <p className="jd-sub">
        {job.company} · {job.department}
      </p>
      <ul className="jd-tags" aria-label="Role summary">
        <li>{job.location}</li>
        <li>{job.workplaceType}</li>
        <li>{job.employmentType}</li>
        {job.categories.slice(0, 2).map((category) => (
          <li key={category.id} className="jd-tag-cat">
            {category.label}
          </li>
        ))}
      </ul>
    </header>
  );

  const body = (
    <>
      {s.about ? (
        <section className="job-section">
          <h2>About the role</h2>
          <p className="jd-prose">{s.about}</p>
        </section>
      ) : null}
      {!compact && job.companySummary?.trim() ? (
        <section className="job-section">
          <h2>About {job.company}</h2>
          <p className="jd-prose">{job.companySummary}</p>
        </section>
      ) : null}
      <ListSection title="Key responsibilities" items={s.responsibilities} />
      <ListSection title="Required qualifications" items={s.required} />
      {compact ? null : (
        <>
          <ListSection title="Preferred qualifications" items={s.preferred} />
          {s.skills.length > 0 ? (
            <section className="job-section">
              <h2>Technical and functional skills</h2>
              <ul className="jd-chips">
                {s.skills.map((skill) => (
                  <li key={skill.name} title={`From the posting: “…${skill.evidence}…”`}>
                    {skill.name}
                  </li>
                ))}
              </ul>
              <p className="jd-fine">Skills named in this posting.</p>
            </section>
          ) : null}
          {hasExperience ? (
            <section className="job-section">
              <h2>Experience and education</h2>
              <ul>
                {s.minimumYears !== null ? <li>{s.minimumYears}+ years of relevant experience, as stated in the requirements.</li> : null}
                {s.education.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {s.certifications.length > 0 ? (
            <section className="job-section">
              <h2>Certifications</h2>
              <ul>
                {s.certifications.map((c) => (
                  <li key={c.text}>
                    {c.text}
                    {c.preferred ? <span className="jd-pref"> (preferred)</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {job.salaryLabel ? (
            <section className="job-section">
              <h2>Compensation</h2>
              <p>{job.salaryLabel}</p>
            </section>
          ) : null}
          <ApplicationProcess job={job} />
        </>
      )}
    </>
  );

  if (compact) {
    return (
      <article className="jd jd-compact">
        {header}
        <ApplyActions job={job} />
        <Facts job={job} compact />
        {body}
        <p className="jd-more">
          <Link href={`/jobs/${job.slug}`}>View full job details {ARROW}</Link>
        </p>
      </article>
    );
  }

  return (
    <article className="jd jd-full">
      <nav className="jd-crumb" aria-label="Breadcrumb">
        <Link href="/jobs">← All jobs</Link>
      </nav>
      {header}
      <div className="jd-grid">
        <div className="jd-main">{body}</div>
        <aside className="jd-aside" aria-label="Apply for this role">
          <div className="jd-panel">
            <ApplyActions job={job} />
            {panelExtra ? <div className="jd-panel-extra">{panelExtra}</div> : null}
            <Facts job={job} compact={false} />
          </div>
        </aside>
      </div>
      {related.length > 0 ? (
        <section className="jd-related" aria-labelledby="jd-related-h">
          <h2 id="jd-related-h">Related opportunities</h2>
          <ul>
            {related.map((other) => (
              <li key={other.id}>
                <Link href={`/jobs/${other.slug}`}>
                  <span className="jd-related-t">{other.title}</span>
                  <span className="jd-related-m">
                    {other.location} · {other.workplaceType} · {other.employmentType}
                  </span>
                  {other.summary ? <span className="jd-related-s">{other.summary}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
