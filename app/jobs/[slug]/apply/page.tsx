import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { getJobBySlug } from "@/lib/neon/jobs";
import { toPublicJob } from "@/lib/neon/public-jobs";

import { ApplyForm, type ApplyFormJob } from "./ApplyForm";

/**
 * The public Easy Apply page, reading from Neon.
 *
 * Two deliberate choices:
 *
 * It reads the raw row through lib/neon/jobs.ts rather than
 * getPublicJobBySlug, because that helper collapses "no such role" and "not
 * published" into one null and this page has to tell them apart: a wrong URL
 * is a 404, while a role that closed deserves the panel below, which explains
 * itself and links on. The row then goes through the same toPublicJob mapping
 * the listing and detail pages use, so labels and the open/closed rule cannot
 * drift between the page that shows the apply button and the page it leads to.
 *
 * There is no EXTERNAL branch any more. The Supabase posting model carried an
 * application_type and an external_apply_url; the Neon `jobs` table has
 * neither, because every role in it is an internal Easy Apply role. Reinstate
 * the redirect when, and only when, those columns exist.
 */

type ApplyPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ApplyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const row = await getJobBySlug(slug);
  if (!row) return { title: "Apply" };
  const job = toPublicJob(row);
  return {
    title: `Apply · ${job.title}`,
    description: `Easy Apply for ${job.title} at ${job.company}`,
  };
}

export default async function JobApplyPage({ params }: ApplyPageProps) {
  const { slug } = await params;
  const row = await getJobBySlug(slug);
  if (!row) notFound();

  const job = toPublicJob(row);

  // PUBLISHED plus a deadline that has not passed, which is exactly what
  // /jobs/[slug] uses to decide whether to show an apply button at all.
  const open = row.status === "PUBLISHED" && job.acceptingApplications;

  if (!open) {
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

  const formJob: ApplyFormJob = {
    slug: job.slug,
    title: job.title,
    company: job.company,
    location: job.location,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    reference: job.referenceNumber,
  };

  return (
    <>
      <MarketingHeader assistantContext={{ page: "job", jobSlug: job.slug }} />
      <main>
        <ApplyForm job={formJob} />
      </main>
      <MarketingFooter />
    </>
  );
}
