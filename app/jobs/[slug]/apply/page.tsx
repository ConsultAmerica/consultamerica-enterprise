import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { getJobBySlug } from "@/lib/neon/jobs";
import type { EmploymentType, JobRow, WorkplaceType } from "@/lib/neon/types";

import { ApplyForm, type ApplyFormJob } from "./ApplyForm";

/**
 * The public Easy Apply page, reading from Neon.
 *
 * Both the page and submitApplicationAction resolve the role by slug from
 * `jobs` and gate on status === "PUBLISHED". Keeping the two gates identical
 * matters: a page that renders a form the action will refuse is a candidate
 * typing out an application for nothing.
 *
 * There is no EXTERNAL branch any more. The Supabase posting model carried an
 * application_type and an external_apply_url; the Neon `jobs` table has
 * neither, because every role in it is an internal Easy Apply role. Reinstate
 * the redirect when, and only when, those columns exist.
 */

type ApplyPageProps = {
  params: Promise<{ slug: string }>;
};

// Display labels for the Neon enums. Deliberately local rather than reusing
// types/organization.ts, whose maps are typed against the Supabase enums and
// have no INTERNSHIP entry, so indexing them with a Neon value would not
// typecheck.
const WORKPLACE_LABEL: Record<WorkplaceType, string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ONSITE: "On-site",
};

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full Time",
  PART_TIME: "Part Time",
  CONTRACT: "Contract",
  TEMPORARY: "Temporary",
  INTERNSHIP: "Internship",
};

/** Single-tenant ATS: every role in Neon is a Consult America role. */
const COMPANY = "Consult America";

function toFormJob(job: JobRow): ApplyFormJob {
  return {
    slug: job.slug,
    title: job.title,
    company: COMPANY,
    location: job.location,
    employmentType: EMPLOYMENT_LABEL[job.employment_type],
    workplaceType: WORKPLACE_LABEL[job.workplace_type],
    reference: job.reference,
  };
}

export async function generateMetadata({ params }: ApplyPageProps): Promise<Metadata> {
  const { slug } = await params;
  const job = await getJobBySlug(slug);
  if (!job) return { title: "Apply" };
  return {
    title: `Apply · ${job.title}`,
    description: `Easy Apply for ${job.title} at ${COMPANY}`,
  };
}

export default async function JobApplyPage({ params }: ApplyPageProps) {
  const { slug } = await params;
  const job = await getJobBySlug(slug);
  if (!job) notFound();

  if (job.status !== "PUBLISHED") {
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

  return (
    <>
      <MarketingHeader assistantContext={{ page: "job", jobSlug: job.slug }} />
      <main>
        <ApplyForm job={toFormJob(job)} />
      </main>
      <MarketingFooter />
    </>
  );
}
