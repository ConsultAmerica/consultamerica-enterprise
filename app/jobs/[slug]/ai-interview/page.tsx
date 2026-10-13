import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { consultHireConfig } from "@/lib/consulthire/client";
import { getJobBySlug } from "@/lib/neon/jobs";
import { toPublicJob } from "@/lib/neon/public-jobs";


/**
 * The AI interview apply page.
 *
 * Deliberately the same shape as app/jobs/[slug]/apply/page.tsx, down to the
 * "applications closed" panel, because a candidate choosing between the two
 * buttons on a posting should not land in two differently built products.
 *
 * It reads the raw row through lib/neon/jobs.ts rather than getPublicJobBySlug
 * for the same reason the Easy Apply page does: that helper collapses "no such
 * role" and "not published" into one null, and this page has to tell them
 * apart. A wrong URL is a 404; a role that closed gets the panel, which
 * explains itself and links on.
 *
 * ONE EXTRA GATE OVER EASY APPLY. The job must also have a READY ConsultHire
 * interview. A posting with none is not an error and not a 404: the role is
 * real and open, it just takes Easy Apply only, so the visitor is sent there
 * rather than shown a dead end. That is also what a stale bookmark hits after a
 * recruiter regenerates an interview and it fails.
 */

type AiInterviewPageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * NOT EXPORTED, and that is load-bearing rather than tidiness.
 *
 * Next 16 rejects a route that exports both `metadata` and
 * `generateMetadata` ("cannot be exported at the same time"), and it is a build
 * error, not a warning: exporting both took the whole repo's build down. This
 * route needs the dynamic one, because the title carries the job title, so the
 * static settings live here as a plain const that generateMetadata spreads.
 *
 * The noindex must survive that move. Nothing on this page is worth indexing:
 * it is a form, the posting it belongs to is the page that should rank, and an
 * apply form in search results strands visitors on a URL that stops working
 * the moment the role closes. `follow: true` so the crawler still reaches the
 * posting and the rest of the site from here.
 */
const BASE_METADATA: Metadata = {
  robots: { index: false, follow: true },
};

export async function generateMetadata({ params }: AiInterviewPageProps): Promise<Metadata> {
  const { slug } = await params;
  const row = await getJobBySlug(slug);
  if (!row) return { ...BASE_METADATA, title: "AI interview" };
  const job = toPublicJob(row);
  return {
    ...BASE_METADATA,
    title: `AI interview · ${job.title}`,
    description: `Apply for ${job.title} at ${job.company} through an AI interview.`,
  };
}

/** The shared "this is not available" panel, so both refusals look the same. */
function ClosedPanel({
  slug,
  title,
  eyebrow,
  message,
  offerEasyApply,
}: {
  slug: string;
  title: string;
  eyebrow: string;
  message: string;
  offerEasyApply: boolean;
}) {
  return (
    <>
      <MarketingHeader assistantContext={{ page: "job", jobSlug: slug }} />
      <main>
        <div className="apply-page">
          <div className="wrap apply-page-inner">
            <div className="apply-intro" style={{ marginBottom: 16 }}>
              <p className="apply-eyebrow">{eyebrow}</p>
              <h1 style={{ fontSize: "clamp(28px, 3.6vw, 40px)" }}>{title}</h1>
            </div>
            <div className="apply-panel">
              <p className="apply-job-meta" style={{ marginTop: 0 }}>
                {message}
              </p>
              <div className="apply-actions apply-actions-end" style={{ marginTop: 28 }}>
                {/* Easy Apply first and primary: when the AI route is
                    unavailable but the role is open, applying normally is the
                    thing the visitor came here to do. */}
                {offerEasyApply ? (
                  <Link href={`/jobs/${slug}/apply`} className="btn btn-primary">
                    Use Easy Apply →
                  </Link>
                ) : null}
                <Link href="/jobs" className={offerEasyApply ? "btn btn-dark" : "btn btn-primary"}>
                  View current openings →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}

export default async function JobAiInterviewPage({ params }: AiInterviewPageProps) {
  const { slug } = await params;
  const row = await getJobBySlug(slug);
  if (!row) notFound();

  const job = toPublicJob(row);

  // PUBLISHED plus a deadline that has not passed, which is exactly what
  // /jobs/[slug] uses to decide whether to show an apply button at all.
  const open = row.status === "PUBLISHED" && job.acceptingApplications;

  if (!open) {
    return (
      <ClosedPanel
        slug={job.slug}
        title={job.title}
        eyebrow="Applications closed"
        message="This position is no longer accepting applications."
        offerEasyApply={false}
      />
    );
  }

  // Both halves re-checked here as well as in the action: the page must not
  // render a form that the action will refuse, and the action must not trust
  // the page. See the note on the same check in ./actions.ts.
  const ready = row.consulthire_status === "READY" && Boolean(row.consulthire_slug);
  if (!ready || !consultHireConfig()) {
    return (
      <ClosedPanel
        slug={job.slug}
        title={job.title}
        eyebrow="AI interview unavailable"
        message={
          "This role does not have an AI interview at the moment. You can still apply with Easy " +
          "Apply, and the recruiting team reviews every application the same way."
        }
        offerEasyApply
      />
    );
  }

  /*
    STRAIGHT INTO THE INTERVIEW. NO FORM HERE.

    This page used to collect a name, email and phone before handing over.
    ConsultHire then asked for the name and email again on its own start
    screen, so the candidate typed the same two things twice to do one thing.
    Two forms for one action is one form too many, and the first one was the
    one worth losing.

    WHAT THAT COSTS, AND WHY IT IS WORTH IT. The application row used to be
    created here, before the interview, so the result always had somewhere to
    land. Now it is created when the result arrives: the completion webhook
    carries the candidate's name, email and the job id, and
    app/api/webhooks/consulthire/route.ts creates the candidate and the
    application from them if none exists.

    The consequence, stated plainly: a candidate who starts an interview and
    abandons it leaves no application record. That is the honest outcome. An
    abandoned interview is not an application, and the previous behaviour
    produced rows in the queue for people who never answered a question.

    Identity is still never taken from a URL. It is collected by ConsultHire at
    the start of the interview and travels back inside a signed webhook, which
    is the same trust boundary as before, just placed at the other end of the
    journey.
  */
  redirect(`${consultHireConfig()!.baseUrl}/i/${row.consulthire_slug}`);
}
