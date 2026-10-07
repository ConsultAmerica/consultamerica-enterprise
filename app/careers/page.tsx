import type { Metadata } from "next";
import Link from "next/link";

import { CAPABILITIES, PHASES } from "@/components/marketing/company-copy";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { assertProductionSupabaseConfigured } from "@/app/lib/supabase/server";
import { getOpenJobs } from "@/lib/jobs";
import type { Job } from "@/lib/jobs/public-model";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Careers at Consult America — engineers, data scientists, and consultants shipping real systems for real enterprises.",
};

// Featured openings come from the same repository + eligibility filter as /jobs.
export const dynamic = "force-dynamic";

const FEATURED_LIMIT = 6;

const HIRING_STEPS = [
  { title: "Explore opportunities", body: "Browse open roles and find the work that fits your experience." },
  { title: "Apply", body: "A short application with your resume — it carries your professional history." },
  { title: "Recruiting review", body: "Our recruiting team reviews your application against the role." },
  { title: "Interview process", body: "Shortlisted candidates are invited to interviews with the team." },
  { title: "Decision", body: "The team makes a hiring decision for the role." },
] as const;

const ARROW = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

async function loadFeaturedJobs(): Promise<{ jobs: Job[]; error?: string }> {
  try {
    assertProductionSupabaseConfigured();
    const jobs = await getOpenJobs();
    return { jobs: jobs.slice(0, FEATURED_LIMIT) };
  } catch {
    return { jobs: [], error: "Open roles are unavailable right now." };
  }
}

export default async function CareersPage() {
  const { jobs, error } = await loadFeaturedJobs();

  return (
    <>
      <MarketingHeader solid={false} />
      <main className="about-page careers-page">
        <section className="about-hero">
          <div className="wrap about-hero-inner">
            <p className="about-eyebrow">Careers</p>
            <h1>
              Build what moves
              <span className="g"> business forward.</span>
            </h1>
            <p className="about-lead">
              Work on enterprise technology, AI, cloud and transformation programs
              that turn complex challenges into working systems.
            </p>
            <div className="about-people-actions">
              <Link href="/jobs" className="btn btn-primary">
                Explore open roles {ARROW}
              </Link>
            </div>
          </div>
        </section>

        <section className="about-who band">
          <div className="wrap about-who-grid">
            <div>
              <p className="eyebrow">Working here</p>
              <p className="about-editorial serif">
                Beyond projects, we build the <span className="hl">teams that run them</span>.
              </p>
              <p className="about-copy">
                We hire engineers, data scientists, and consultants who want to ship
                real systems for real enterprises — and keep growing while they do it.
              </p>
              <p className="about-copy" style={{ marginTop: 14 }}>
                Consulting and engineering are human businesses. Our people work where
                engineering, AI, and enterprise consulting meet — connecting Oracle Cloud,
                data intelligence, and application engineering so transformation reaches
                production.
              </p>
            </div>
            <div className="about-who-media">
              <img src="/img/team2.jpg" alt="Consult America team collaborating" />
            </div>
          </div>
        </section>

        <section className="band darkbg about-what">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Areas of work</span>
              <h2>The practices our people deliver.</h2>
              <p>Where our teams work across the transformation. Open roles vary over time.</p>
            </div>
            <div className="about-capability-list">
              {CAPABILITIES.map((item, index) => (
                <div key={item.title} className="about-capability-row">
                  <span className="about-capability-nub">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="band about-how">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">How we work</span>
              <h2>Strategy → Design → Build → Run</h2>
              <p>
                Every engagement moves through the same disciplined motion —
                architecture through production delivery.
              </p>
            </div>
            <ol className="about-phases">
              {PHASES.map((phase) => (
                <li key={phase}>
                  <span>{phase}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="band tintbg careers-openings" id="openings">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Featured opportunities</span>
              <h2>Current opportunities</h2>
              <p>Discover current opportunities across Consult America.</p>
            </div>
            {jobs.length > 0 ? (
              <ul className="careers-openings-list">
                {jobs.map((job) => (
                  <li key={job.id}>
                    <Link href={`/jobs/${job.slug}`} className="careers-opening">
                      <div>
                        <h3>{job.title}</h3>
                        <p className="meta">
                          {[job.location, job.employmentType, job.workplaceType]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <span className="careers-opening-cta">
                        View role {ARROW}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="careers-openings-empty">
                <h3>{error ?? "We don't have any open roles at the moment."}</h3>
                <p>We&apos;re always growing our capabilities. Check back for future opportunities.</p>
              </div>
            )}
            <div className="careers-openings-all">
              <Link href="/jobs" className="btn btn-dark">
                View all open roles {ARROW}
              </Link>
            </div>
          </div>
        </section>

        <section className="band about-how careers-process">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Hiring process</span>
              <h2>How hiring works.</h2>
            </div>
            <ol className="careers-steps">
              {HIRING_STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className="about-capability-nub">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="band cta">
          <div className="wrap cta-inner">
            <span className="eyebrow" style={{ color: "var(--cyan)", justifyContent: "center" }}>
              Careers
            </span>
            <h2 style={{ marginTop: 18 }}>Explore open roles.</h2>
            <p>See every position currently accepting applications.</p>
            <div className="cta-actions">
              <Link href="/jobs" className="btn btn-primary">
                Explore open roles {ARROW}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
