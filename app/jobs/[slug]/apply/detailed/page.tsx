import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DetailedApplyForm, type SignedInApply } from "@/components/jobs/DetailedApplyForm";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { effectiveProfile } from "@/lib/candidate-portal/resume-profile";
import { getCandidateSession } from "@/lib/candidate-portal/session";
import { getCandidatePortalStore } from "@/lib/candidate-portal/store";
import { getJobBySlug } from "@/lib/jobs";
import type { Job } from "@/lib/jobs/public-model";
import { safeExternalApplyUrl } from "@/lib/jobs/portal";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const job = await getJobBySlug(slug);
  return job
    ? { title: `Detailed application · ${job.title}`, description: `Apply for ${job.title} at ${job.company} with a full profile` }
    : { title: "Apply" };
}

/** Detailed Apply — same eligibility, candidate model and ATS as Easy Apply (/jobs/[slug]/apply). */
export const dynamic = "force-dynamic";

/**
 * Signed-in candidates resume their open draft for this job, or start from
 * their profile and default résumé. Anonymous visitors get the same form
 * without drafts — they are never required to register.
 */
async function signedInApply(job: Job): Promise<SignedInApply | null> {
  const session = await getCandidateSession();
  if (!session) return null;
  const store = getCandidatePortalStore();
  const [draft, resumes, profile] = await Promise.all([
    store.findOpenDraft(session.candidateId, job.requisitionId || job.id),
    store.listResumes(session.candidateId),
    store.getProfile(session.candidateId),
  ]);
  const library = resumes.map((r) => ({ documentId: r.documentId, fileName: r.fileName, isDefault: r.isDefault, uploadedAt: r.uploadedAt }));
  const base = { email: session.email, displayName: session.displayName, resumes: library };

  if (draft && draft.status === "DRAFT") {
    const resumeStillAvailable = library.some((r) => r.documentId === draft.resumeDocumentId);
    return {
      ...base,
      draft: { id: draft.id, revision: draft.revision, updatedAt: draft.updatedAt },
      initial: { ...draft.payload, resumeDocumentId: resumeStillAvailable ? draft.resumeDocumentId : null },
    };
  }

  const defaultResume = library.find((r) => r.isDefault) ?? library[0] ?? null;
  const resumeView = defaultResume ? await store.getResumeProfile(session.candidateId, defaultResume.documentId) : null;
  return {
    ...base,
    draft: null,
    inProgress: draft?.status === "SUBMITTING",
    initial: {
      contact: {
        firstName: profile?.firstName ?? "",
        lastName: profile?.lastName ?? "",
        phone: profile?.phone ?? "",
        location: [profile?.city, profile?.state].filter(Boolean).join(", "),
        linkedinUrl: profile?.linkedinUrl ?? "",
        portfolioUrl: profile?.portfolioUrl ?? "",
      },
      profile: effectiveProfile(resumeView ?? { parsed: null, reviewed: null }),
      answers: [],
      step: 0,
      resumeDocumentId: defaultResume?.documentId ?? null,
    },
  };
}

export default async function DetailedApplyPage({ params }: Props) {
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
                <p className="apply-job-meta" style={{ marginTop: 0 }}>This position is no longer accepting applications.</p>
                <p style={{ marginTop: 28 }}>
                  <Link href="/jobs" className="btn btn-primary">View current openings →</Link>
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
        <DetailedApplyForm job={job} candidate={await signedInApply(job)} />
      </main>
      <MarketingFooter />
    </>
  );
}
