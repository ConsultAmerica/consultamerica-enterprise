import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JobDetailView } from "@/components/jobs/JobDetailView";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { getCandidateSession } from "@/lib/candidate-portal/session";
import { getCandidatePortalStore } from "@/lib/candidate-portal/store";
import { relatedJobs } from "@/lib/jobs/detail";
import type { Job } from "@/lib/jobs/public-model";
import { getPublicJobBySlug, listPublicJobs } from "@/lib/neon/public-jobs";
import { logServerError } from "@/lib/observability/logger";

type JobPageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * A posting that could not be read, told apart from one that does not exist.
 *
 * The distinction matters on this page and nowhere else: answering 404 to an
 * unreachable database would tell search engines (and anyone holding the link)
 * that a live role has been taken down, and the posting would have to be
 * re-indexed from scratch once the database came back. So a read failure
 * renders a neutral "try again" panel instead, and only a genuine miss 404s.
 */
type LoadedJob = { job: Job | null; unavailable: boolean };

async function loadJob(slug: string): Promise<LoadedJob> {
  try {
    return { job: await getPublicJobBySlug(slug), unavailable: false };
  } catch (error) {
    // Neutral message to the visitor, full detail to the server log.
    logServerError("jobs.detail.load", error, { slug });
    return { job: null, unavailable: true };
  }
}

/** Other open roles to suggest. Never worth failing the page over. */
async function loadRelatedJobs(job: Job): Promise<Job[]> {
  try {
    return relatedJobs(job, await listPublicJobs(), 3);
  } catch (error) {
    logServerError("jobs.detail.related", error, { slug: job.slug });
    return [];
  }
}

export async function generateMetadata({ params }: JobPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { job, unavailable } = await loadJob(slug);
  if (!job) {
    return { title: unavailable ? "Role unavailable" : "Job not found" };
  }
  return {
    title: job.title,
    description: job.summary || `${job.title} at ${job.company}`,
  };
}

function jobPostingJsonLd(job: Job) {
  const employmentMap: Record<string, string> = {
    "Full Time": "FULL_TIME",
    "Part Time": "PART_TIME",
    Contract: "CONTRACTOR",
    Temporary: "TEMPORARY",
    Internship: "INTERN",
  };
  const payload: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description || job.summary,
    datePosted: job.postedAt,
    employmentType: employmentMap[job.employmentType] ?? job.employmentType,
    hiringOrganization: {
      "@type": "Organization",
      name: job.company,
    },
    jobLocation: {
      "@type": "Place",
      address: job.location,
    },
    identifier: {
      "@type": "PropertyValue",
      name: job.company,
      value: job.referenceNumber,
    },
    url: `/jobs/${job.slug}`,
  };
  if (job.closesAt) payload.validThrough = job.closesAt;
  if (job.salaryMin != null || job.salaryMax != null) {
    payload.baseSalary = {
      "@type": "MonetaryAmount",
      currency: "USD",
      value: {
        "@type": "QuantitativeValue",
        minValue: job.salaryMin,
        maxValue: job.salaryMax,
        unitText: "YEAR",
      },
    };
  }
  return payload;
}

export default async function JobSlugPage({ params }: JobPageProps) {
  const { slug } = await params;
  const { job, unavailable } = await loadJob(slug);

  // notFound() signals by throwing, so it has to stay outside the try/catch in
  // loadJob — catching it there would turn every 404 into "unavailable".
  if (!job) {
    if (!unavailable) notFound();

    return (
      <>
        <MarketingHeader assistantContext={{ page: "job", jobSlug: slug }} />
        <main className="jobs-shell">
          <div className="wrap" style={{ paddingTop: 120, paddingBottom: 80, maxWidth: 860 }}>
            <div className="jobs-empty" style={{ textAlign: "left", padding: 0 }}>
              <h1 className="job-detail-title">This role can&apos;t be loaded right now</h1>
              <p className="job-detail-meta" style={{ marginTop: 16 }}>
                Something went wrong on our side. Please try again in a few minutes.
              </p>
              <p style={{ marginTop: 28 }}>
                <Link href="/jobs" className="btn btn-primary">
                  View open roles
                </Link>
              </p>
            </div>
          </div>
        </main>
        <MarketingFooter />
      </>
    );
  }

  const session = await getCandidateSession();
  const requisitionId = job.requisitionId || job.id;
  const [saved, related] = await Promise.all([
    session ? getCandidatePortalStore().isJobSaved(session.candidateId, requisitionId) : Promise.resolve(false),
    job.acceptingApplications ? loadRelatedJobs(job) : Promise.resolve([]),
  ]);

  return (
    <>
      <MarketingHeader assistantContext={{ page: "job", jobSlug: job.slug }} />
      <main className="jobs-shell">
        <div className={`wrap${job.acceptingApplications ? " jd-wrap" : ""}`} style={job.acceptingApplications ? undefined : { paddingTop: 120, paddingBottom: 80, maxWidth: 860 }}>
          {job.acceptingApplications ? (
            <>
              <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                  __html: JSON.stringify(jobPostingJsonLd(job)),
                }}
              />
              {/* No Save-job control: it belongs to the Supabase candidate
                  portal, which this Neon-backed page is not part of. Offering
                  "Sign in to save" with no account to sign into is worse than
                  not offering it. */}
              <JobDetailView job={job} related={related} />
            </>
          ) : (
            <div className="jobs-empty" style={{ textAlign: "left", padding: 0 }}>
              <h1 className="job-detail-title">{job.title}</h1>
              <p className="job-detail-meta" style={{ marginTop: 16 }}>
                This posting is no longer accepting applications.
              </p>
              <p style={{ marginTop: 28 }}>
                <Link href="/jobs" className="btn btn-primary">
                  View open roles
                </Link>
              </p>
            </div>
          )}
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}
