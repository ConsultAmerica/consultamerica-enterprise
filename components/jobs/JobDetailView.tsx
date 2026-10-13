import Link from "next/link";
import type { ReactNode } from "react";

import { CONSULTHIRE_BOT, buildJobSections, daysUntil } from "@/lib/jobs/detail";
import type { Job } from "@/lib/jobs/public-model";
import { formatPostedDate, locationLabels } from "@/lib/jobs/public-model";
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

/**
 * Whether a visitor is ever offered the AI interview route.
 *
 * Off for now, by request. Ten of the eleven published roles carry a generated
 * ConsultHire interview and would otherwise show a live "Apply with AI
 * Interview" button, so this is what holds the feature back rather than the
 * absence of interviews.
 *
 * Off, every posting falls through to the same "coming soon" chip it showed
 * before the integration existed, and Easy Apply is the one way in. Nothing is
 * deleted: the interviews, the route at /jobs/[slug]/ai-interview and the
 * webhook that records a score are all untouched, so turning this back on
 * restores the route for every role that already has one.
 */
const OFFER_AI_INTERVIEW = false;

/**
 * Secondary CTA to the ConsultHire bot. A plain link: nothing about the visitor
 * is added to the URL.
 *
 * While CONSULTHIRE_BOT.enabled is false this renders a non-interactive
 * "coming soon" chip rather than a disabled <button>. A disabled button still
 * reads as an action the visitor is being refused; a plain chip reads as a
 * statement about the feature, which is what we mean.
 */
export function ConsultHireBotLink({ className = "btn btn-dark jd-bot" }: { className?: string }) {
  if (!CONSULTHIRE_BOT.enabled) {
    return (
      <span className="jd-bot-soon">
        {BOT_ICON}
        {CONSULTHIRE_BOT.comingSoonLabel}
      </span>
    );
  }

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

/**
 * The AI interview route for this specific role.
 *
 * NOT ConsultHireBotLink. That one is a generic marketing link to the product
 * and deliberately carries nothing about the visitor or the job; this is an
 * application. It goes to our own page, which takes the candidate's details,
 * files an application with method AI_INTERVIEW, creates the row the result
 * will land on, and only then mints the signed launch URL. So it is a same-tab
 * internal Link rather than a new-tab external anchor: the candidate is
 * starting an application with us, not visiting another site.
 */
function AiInterviewLink({ job }: { job: Job }) {
  return (
    <Link href={`/jobs/${job.slug}/ai-interview`} className="btn btn-dark jd-bot">
      {BOT_ICON}
      Apply with AI Interview
    </Link>
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
  /*
    BOTH ROUTES, WITH EASY APPLY STILL FIRST AND STILL PRIMARY.

    The AI interview is an alternative, not a replacement, and the visual
    hierarchy says so: Easy Apply keeps the primary button and the position it
    has always had, so nothing about that journey changes for anyone. A
    candidate who does not want to be interviewed by a bot must not have to
    look for the ordinary way in.

    Offered only for an INTERNAL role with a generated interview. An EXTERNAL
    posting is applied to on somebody else's site, so there is no application
    of ours for a result to attach to.
  */
  const offerAiInterview =
    OFFER_AI_INTERVIEW && job.applicationType === "INTERNAL" && job.aiInterviewReady === true;
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
      {offerAiInterview ? (
        <>
          <AiInterviewLink job={job} />
          <p className="jd-bot-note">
            A 20 minute conversation with our AI interviewer, built from this job description. Your
            answers go to the recruiting team with your application.
          </p>
        </>
      ) : (
        <>
          {/* Unchanged for every job without a generated interview: the
              generic ConsultHire link, or the "coming soon" chip while
              CONSULTHIRE_BOT.enabled is false. */}
          <ConsultHireBotLink />
          {/* The note only makes sense next to a working link. While the bot is
              off, "it doesn't submit an application" explains a button that isn't
              there. */}
          {CONSULTHIRE_BOT.enabled ? <p className="jd-bot-note">{CONSULTHIRE_BOT.note}</p> : null}
        </>
      )}
    </div>
  );
}

function Facts({ job, compact }: { job: Job; compact: boolean }) {
  const closesIn = daysUntil(job.closesAt);
  /*
    Both Location and Work arrangement stay here even for a remote role, where
    they carry the same word. This is a labelled definition list, not a run of
    chips: "Location: Remote (US)" and "Work arrangement: Remote" answer two
    different questions and the labels say which, so neither reads as a repeat.
    Collapsing them would also lose the arrangement for anyone scanning the
    facts table for exactly that. The deduplication rule applies to the
    unlabelled meta lines, where the pair really does read as one word twice.
  */
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
            {/* Two routes are described only where both exist. Naming the AI
                interview on a posting that has not got one would advertise a
                button the visitor cannot find. */}
            <strong>Apply.</strong>{" "}
            {OFFER_AI_INTERVIEW && job.aiInterviewReady === true ? (
              <>
                Two ways in, and either one files a complete application. Easy Apply takes your
                contact details and résumé in a few minutes. Apply with AI Interview adds a 20
                minute conversation about this role, which the recruiting team reads alongside
                your application. No account is needed for either.
              </>
            ) : (
              <>
                Easy Apply takes your contact details and résumé in a few minutes; no account is
                needed.
              </>
            )}
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
        {/* One chip per label, and for a remote role that is one chip, not two
            saying Remote. See showWorkplaceType in lib/jobs/public-model.ts. */}
        {locationLabels(job.location, job.workplaceType).map((label) => (
          <li key={label}>{label}</li>
        ))}
        <li>{job.employmentType}</li>
        {/*
          Categories removed from this row. It describes the role in facts a
          candidate is deciding on, location, arrangement, employment type, and
          a taxonomy label is not one of those: it is how the portal files the
          job, not something the reader needs told twice next to the title.
        */}
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
          {/* Admin-entered perks. ListSection renders nothing for an empty
              list, so jobs without benefits are unchanged. */}
          <ListSection title="Benefits" items={job.benefits ?? []} />
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
                    {[
                      ...locationLabels(other.location, other.workplaceType),
                      other.employmentType,
                    ].join(" · ")}
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
