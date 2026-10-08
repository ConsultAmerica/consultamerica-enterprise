import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EasyApplyForm } from "@/components/jobs/EasyApplyForm";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { getJobBySlug } from "@/lib/jobs";
import { safeExternalApplyUrl } from "@/lib/jobs/portal";

type ApplyPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ApplyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const job = await getJobBySlug(slug);
  if (!job) return { title: "Apply" };
  return {
    title: `Apply · ${job.title}`,
    description: `Easy Apply for ${job.title} at ${job.company}`,
  };
}

export default async function JobApplyPage({ params }: ApplyPageProps) {
  const { slug } = await params;
  const job = await getJobBySlug(slug);
  if (!job) notFound();

  if (!job.acceptingApplications) {
    return (
      <>
        <MarketingHeader assistantContext={{ page: "job", jobSlug: job.slug }} />
        <main>
          <div className="apply-page">
            <div className="wrap apply-page-inner">
              <div className="apply-intro" style={{ marginBottom: 16 }}>
                <p className="apply-eyebrow">Applications closed</p>
                <h1 style={{ fontSize: "clamp(28px, 3.6vw, 40px)" }}>{job.title}</h1>
              </div>
              <div className="apply-panel">
                <p className="apply-job-meta" style={{ marginTop: 0 }}>
                  This position is no longer accepting applications.
                </p>
                <p style={{ marginTop: 28 }}>
                  <Link href="/jobs" className="btn btn-primary">
                    View current openings →
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </main>
        <MarketingFooter />
      </>
    );
  }

  if (job.applicationType === "EXTERNAL") {
    const external = safeExternalApplyUrl(job.externalApplyUrl);
    if (external) redirect(external);
    redirect(`/jobs/${job.slug}`);
  }

  return (
    <>
      <MarketingHeader assistantContext={{ page: "job", jobSlug: job.slug }} />
      <main>
        <EasyApplyForm job={job} />
      </main>
      <MarketingFooter />
    </>
  );
}
