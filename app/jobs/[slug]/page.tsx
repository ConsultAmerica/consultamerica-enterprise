import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SaveJobButton } from "@/components/candidate/SaveJobButton";
import { JobDetailView } from "@/components/jobs/JobDetailView";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { getCandidateSession } from "@/lib/candidate-portal/session";
import { getCandidatePortalStore } from "@/lib/candidate-portal/store";
import { getJobBySlug } from "@/lib/jobs";

type JobPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: JobPageProps): Promise<Metadata> {
  const { slug } = await params;
  const job = await getJobBySlug(slug);
  if (!job) return { title: "Job not found" };
  return {
    title: job.title,
    description: job.summary || `${job.title} at ${job.company}`,
  };
}

function jobPostingJsonLd(job: NonNullable<Awaited<ReturnType<typeof getJobBySlug>>>) {
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
      value: job.requisitionId || job.id,
    },
    url: `/jobs/${job.slug}`,
  };
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
  const job = await getJobBySlug(slug);
  if (!job) notFound();
  const session = await getCandidateSession();
  const requisitionId = job.requisitionId || job.id;
  const saved = session ? await getCandidatePortalStore().isJobSaved(session.candidateId, requisitionId) : false;

  return (
    <>
      <MarketingHeader assistantContext={{ page: "job", jobSlug: job.slug }} />
      <main className="jobs-shell">
        <div className="wrap" style={{ paddingTop: 120, paddingBottom: 80, maxWidth: 860 }}>
          {job.acceptingApplications ? (
            <>
              <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                  __html: JSON.stringify(jobPostingJsonLd(job)),
                }}
              />
              <div className="cp-job-tools">
                <SaveJobButton
                  requisitionId={requisitionId}
                  initiallySaved={saved}
                  signedIn={Boolean(session)}
                  returnTo={`/jobs/${job.slug}`}
                />
              </div>
              <JobDetailView job={job} />
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
