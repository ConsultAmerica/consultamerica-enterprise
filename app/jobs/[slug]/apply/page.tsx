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
        <MarketingHeader />
        <main className="jobs-shell">
          <div className="apply-shell">
            <h1 className="job-detail-title">Applications closed</h1>
            <p className="job-detail-meta">
              {job.title} is no longer accepting applications.
            </p>
            <p style={{ marginTop: 28 }}>
              <Link href="/jobs" className="btn btn-primary">
                View open roles
              </Link>
            </p>
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
      <MarketingHeader />
      <main className="jobs-shell">
        <EasyApplyForm job={job} />
      </main>
      <MarketingFooter />
    </>
  );
}
