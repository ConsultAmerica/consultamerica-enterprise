import type { Metadata } from "next";
import Link from "next/link";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";

export const metadata: Metadata = {
  title: "About",
  description:
    "Consult America unites engineering, AI, and enterprise consulting — with the specialized technology talent to design it, build it, and run it in production.",
};

const CAPABILITIES = [
  {
    title: "Enterprise Transformation",
    body: "Reshape finance, procurement, and supply-chain operations around a connected, modern digital core.",
  },
  {
    title: "Oracle Cloud",
    body: "Migrate and modernize ERP, HCM, and SCM on Oracle Cloud, with a right-sized roadmap and a low-drama cutover.",
  },
  {
    title: "AI + Data",
    body: "Forecasting, assistants, and automation — operationalized with the data foundations and guardrails to run in production.",
  },
  {
    title: "Engineering",
    body: "Senior engineers who ship production systems, cloud-native builds, integrations, and the platforms your business runs on.",
  },
  {
    title: "Managed Services",
    body: "We run and evolve what we build — SLAs, monitoring, and continuous improvement after go-live.",
  },
] as const;

const PHASES = ["Strategy", "Design", "Build", "Run"] as const;

const WHY = [
  {
    title: "We engineer, not just advise",
    body: "Production systems, not slideware — senior practitioners stay attached to delivery.",
  },
  {
    title: "AI-first, operationalized",
    body: "Models that run, monitored and governed, connected to the enterprise core.",
  },
  {
    title: "Talent on tap",
    body: "Elite engineers and Oracle specialists — embedded in your teams or hired direct.",
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <MarketingHeader solid={false} />
      <main className="about-page">
        <section className="about-hero">
          <div className="wrap about-hero-inner">
            <p className="about-eyebrow">About Consult America</p>
            <h1>
              Technology that moves
              <span className="g"> business forward.</span>
            </h1>
            <p className="about-lead">
              Consult America unites engineering, AI, and enterprise consulting —
              with the specialized technology talent to design it, build it, and
              run it in production.
            </p>
          </div>
        </section>

        <section className="about-who band">
          <div className="wrap about-who-grid">
            <div>
              <p className="eyebrow">Who we are</p>
              <p className="about-editorial serif">
                Built where <span className="hl">engineering, AI, and enterprise consulting</span>{" "}
                meet — and backed by the specialized talent most firms can only{" "}
                <em>recommend</em>.
              </p>
              <p className="about-copy">
                We connect Oracle Cloud, data intelligence, and application
                engineering so transformation reaches production with measurable
                business return.
              </p>
            </div>
            <div className="about-who-media">
              <img src="/img/meeting.jpg" alt="Consult America consulting team" />
            </div>
          </div>
        </section>

        <section className="band darkbg about-what">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">What we do</span>
              <h2>One partner across the transformation.</h2>
              <p>From the first line of code to the systems your teams operate every day.</p>
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

        <section className="band tintbg about-why">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Why Consult America</span>
              <h2>Delivery that holds up in production.</h2>
            </div>
            <div className="about-why-grid">
              {WHY.map((item) => (
                <div key={item.title} className="about-why-item">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="about-people">
          <div className="about-people-media">
            <img src="/img/careers.jpg" alt="Consult America people" />
          </div>
          <div className="wrap about-people-inner">
            <span className="eyebrow" style={{ color: "var(--cyan)" }}>
              People / Careers
            </span>
            <h2>Build what comes next, with us.</h2>
            <p>
              We hire engineers, data scientists, and consultants who want to ship
              real systems for real enterprises — and keep growing while they do it.
            </p>
            <div className="about-people-actions">
              <Link href="/jobs" className="btn btn-primary">
                View open roles
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <Link href="/#talent" className="btn btn-ghost">
                Life at Consult America
              </Link>
            </div>
          </div>
        </section>

        <section className="band cta" id="contact">
          <div className="wrap cta-inner">
            <span className="eyebrow" style={{ color: "var(--cyan)", justifyContent: "center" }}>
              Start the conversation
            </span>
            <h2 style={{ marginTop: 18 }}>Ready to modernize the core?</h2>
            <p>
              Tell us where you are. A specialist will map the fastest path from your
              legacy systems to AI in production — and the team to get you there.
            </p>
            <div className="cta-actions">
              <a href="mailto:info@consultamerica.com" className="btn btn-primary">
                Talk to an expert
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
              <Link href="/jobs" className="btn btn-ghost">
                Explore careers
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
