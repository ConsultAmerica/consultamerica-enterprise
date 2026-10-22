import type { Metadata } from "next";
import Link from "next/link";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { CAPABILITY_STATEMENT, CAPS, CAP_ICONS, CAP_SERVICES, capabilityAnchor } from "@/data/marketing";
import { serviceHref } from "@/data/services";

export const metadata: Metadata = {
  title: "Capabilities",
  alternates: { canonical: "/capabilities" },
  description:
    "Engineering, AI and data, Oracle, enterprise transformation and managed services — and every service line underneath them.",
};

/**
 * The Capabilities page.
 *
 * WHY IT EXISTS, same reason as /products. "Capabilities" in the navigation
 * pointed at /#capabilities, a homepage section that names the five areas and
 * nothing else. The twenty-five service pages underneath them were reachable
 * only by hovering the desktop mega panel, so on a phone they could not be
 * found at all, and on desktop they required knowing to hover rather than
 * click.
 *
 * This is the page that link should always have gone to: every area, every
 * service line under it, each one a link to the page that already exists.
 *
 * Read from CAPS, CAP_SERVICES and CAP_ICONS — the same arrays the mega panel
 * and the mobile menu use — so none of the three can drift. serviceHref()
 * resolves a service title to its page and returns undefined where no page has
 * been written; those are rendered as plain text rather than dead links,
 * because a link that goes nowhere is worse than a label.
 */

const ARROW = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function CapabilitiesPage() {
  return (
    <>
      {/* The assistant's page-context union lives in lib/assistant and does
            not list this page. "home" is the nearest existing value and only
            decides which suggested questions the Ask AI panel opens with.
            Widening that union is left alone: another session owns it. */}
      <MarketingHeader solid={false} assistantContext={{ page: "home" }} />
      <main className="prodpage">
        <section className="prod-hero">
          <div className="wrap">
            <span className="eyebrow" style={{ color: "var(--cyan)" }}>
              Capabilities
            </span>
            <h1>
              Five areas.
              <br />
              <span className="g">Everything we actually do.</span>
            </h1>
            <p>
              Engineering, AI and data, Oracle, enterprise transformation and managed
              services. Each one has a page for every service line underneath it.
            </p>
          </div>
        </section>

        {/* Capability statement. Contracting officers and procurement teams
            look for this one document, so it sits above the service lines.
            The link opens the PDF in a browser tab rather than downloading it
            (no `download` attribute); saving it is still one click from there. */}
        <section className="band tintbg" id="capability-statement">
          <div className="wrap">
            <div className="capstmt">
              <a className="capstmt-preview" href={CAPABILITY_STATEMENT} target="_blank" rel="noopener">
                <img
                  src="/docs/capability-statement-preview.jpg"
                  alt="First page of the Consult America 2026 capability statement"
                  loading="lazy"
                />
              </a>
              <div className="capstmt-body">
                <span className="eyebrow">Capability statement 2026</span>
                <h2>Everything a contracting officer asks for, on one page.</h2>
                <p>
                  Core competencies, past performance across NIH, DOI, VA, SSA and NOAA, our federal
                  and commercial clients, NAICS codes and company data.
                </p>
                <dl className="capstmt-facts">
                  <div>
                    <dt>Repeat revenue</dt>
                    <dd>90%</dd>
                  </div>
                  <div>
                    <dt>Federal clients</dt>
                    <dd>11</dd>
                  </div>
                  <div>
                    <dt>CAGE code</dt>
                    <dd>58US4</dd>
                  </div>
                  <div>
                    <dt>DUNS</dt>
                    <dd>109504907</dd>
                  </div>
                </dl>
                <div className="cta-actions">
                  <a href={CAPABILITY_STATEMENT} target="_blank" rel="noopener" className="btn btn-primary">
                    View capability statement {ARROW}
                  </a>
                  <span className="capstmt-meta">PDF, 1 page, opens in a new tab</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {CAPS.map(([title, blurb], i) => {
          const services = CAP_SERVICES[i] ?? [];
          return (
            /*
              An id per capability, so the home page's capability rail can link
              straight to the one a visitor clicked rather than dropping them at
              the top of a five-section page to find it again. Derived from the
              title rather than stored separately: CAPS is the single source for
              these names and a hand-maintained slug list would drift from it.
            */
            <section
              className={`band${i % 2 === 1 ? " tintbg" : ""}`}
              key={title}
              id={capabilityAnchor(title)}
            >
              <div className="wrap">
                <div className="cap-area">
                  <div className="cap-area-head">
                    <span className="cap-area-icon">
                      {/* Decorative: the area name is the heading beside it. */}
                      <img src={CAP_ICONS[i]} alt="" aria-hidden loading="lazy" />
                    </span>
                    <div>
                      <h2>{title}</h2>
                      <p>{blurb}</p>
                    </div>
                  </div>

                  <ul className="cap-services">
                    {services.map((service) => {
                      const href = serviceHref(service);
                      return (
                        <li key={service}>
                          {href ? (
                            <Link href={href}>
                              {service}
                              <span aria-hidden>{ARROW}</span>
                            </Link>
                          ) : (
                            // No page written for this service yet. Shown so
                            // the capability is described honestly, but not
                            // linked to a route that does not exist.
                            <span className="cap-service-soon">{service}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </section>
          );
        })}

        <section className="band cta">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Start somewhere</span>
              <h2>Most engagements begin with one specific problem.</h2>
              <p>
                Describe it and we will tell you what it would take, which of these it touches, and
                whether it is worth doing at all.
              </p>
            </div>
            <div className="cta-actions">
              <Link href="/#contact" className="btn btn-primary">
                Talk to an expert {ARROW}
              </Link>
              <Link href="/products" className="btn btn-ghost">
                See what we have built
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
