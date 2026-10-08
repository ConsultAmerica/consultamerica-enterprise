import type { Metadata } from "next";
import Link from "next/link";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";

export const metadata: Metadata = {
  title: "Life at Consult America",
  description:
    "How we work, who we hire, and what it's like to build enterprise systems at Consult America.",
};

/**
 * Life at Consult America.
 *
 * Copy is deliberately conservative: it describes how the work is organised,
 * which is verifiable, and avoids inventing benefits, headcount or awards.
 * Anything specific (PTO, salary bands, team size) must come from the company
 * before it goes on this page.
 */

const PRINCIPLES = [
  {
    k: "We engineer, not just advise",
    d: "Engagements end with systems running in production, not a slide deck and a handover. If you like finishing things, that part matters.",
  },
  {
    k: "You own the thing you build",
    d: "The people who write it review it, deploy it, and get called when it breaks. Ownership is the job, not a stretch assignment.",
  },
  {
    k: "Senior by default",
    d: "Teams are small and experienced. There is no layer of people between you and the client's actual problem.",
  },
  {
    k: "Decisions get written down",
    d: "Why something was built a certain way lives next to the code. It is how a project survives the person who started it.",
  },
];

const DISCIPLINES = [
  ["Engineering", "Cloud-native builds, platforms and integrations"],
  ["AI & Data", "Assistants, forecasting and automation that run in production"],
  ["Oracle", "ERP, HCM and SCM migration and modernization"],
  ["Managed services", "The teams that keep it running after go-live"],
];

const STEPS = [
  ["Intro call", "A conversation about what you have built and what you want next."],
  ["Technical discussion", "Your real work, not a whiteboard puzzle. We talk through decisions and tradeoffs."],
  ["Team conversation", "Meet the people you would actually work with."],
  ["Offer", "Scope, level and compensation in writing."],
];

export default function LifePage() {
  return (
    <>
      <MarketingHeader />

      <main className="life">
        <section className="life-hero">
          <div className="wrap">
            <span className="eyebrow" style={{ color: "var(--cyan)" }}>
              Life at Consult America
            </span>
            <h1>
              Small teams.
              <br />
              <span className="g">Systems that outlast them.</span>
            </h1>
            <p>
              We hire engineers, data scientists and consultants who want to ship real systems for real enterprises,
              and keep growing while they do it.
            </p>
            <div className="life-cta">
              <Link href="/jobs" className="btn btn-primary">
                View open roles
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <Link href="/careers" className="btn btn-ghost">
                Careers overview
              </Link>
            </div>
          </div>
        </section>

        <section className="band">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">How we work</span>
              <h2>Four things that actually shape the day.</h2>
            </div>
            <div className="life-grid">
              {PRINCIPLES.map((p, i) => (
                <article className="life-card" key={p.k}>
                  <span className="life-n">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{p.k}</h3>
                  <p>{p.d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="band tintbg">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Where you'd fit</span>
              <h2>The disciplines we hire into.</h2>
            </div>
            <ul className="life-disc">
              {DISCIPLINES.map(([t, d]) => (
                <li key={t}>
                  <b>{t}</b>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="band">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Hiring</span>
              <h2>What the process looks like.</h2>
              <p>Four steps. We tell you where you stand after each one.</p>
            </div>
            <ol className="life-steps">
              {STEPS.map(([t, d], i) => (
                <li key={t}>
                  <span className="life-step-n">{i + 1}</span>
                  <div>
                    <b>{t}</b>
                    <span>{d}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="band tintbg">
          <div className="wrap life-where">
            <div>
              <span className="eyebrow">Where we are</span>
              <h2>One home base, teams where the work is.</h2>
              <p>
                Headquartered in Hagerstown, Maryland. Delivery teams work alongside client teams wherever the work is.
              </p>
            </div>
            <div className="life-offices">
              <div>
                <b>Headquarters</b>
                <span>
                  1101 Opal Court, Suite 211
                  <br />
                  Hagerstown, MD 21740
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="band cta" id="contact">
          <div className="wrap cta-inner">
            <span className="eyebrow" style={{ color: "var(--cyan)", justifyContent: "center" }}>
              Join us
            </span>
            <h2 style={{ marginTop: 18 }}>Build what comes next, with us.</h2>
            <p>Open roles across engineering, AI and data, Oracle, and managed services.</p>
            <div className="cta-actions">
              <Link href="/jobs" className="btn btn-primary">
                View open roles
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </>
  );
}
