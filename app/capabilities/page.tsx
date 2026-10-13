import type { Metadata } from "next";
import Link from "next/link";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { CAPS, CAP_ICONS, CAP_SERVICES } from "@/data/marketing";
import { serviceHref } from "@/data/services";

export const metadata: Metadata = {
  title: "Capabilities",
  alternates: { canonical: "/capabilities" },
  description:
    "Engineering, AI and data, Oracle Cloud, enterprise transformation and managed services — and every service line underneath them.",
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
              Engineering, AI and data, Oracle Cloud, enterprise transformation and managed
              services. Each one has a page for every service line underneath it.
            </p>
          </div>
        </section>

        {CAPS.map(([title, blurb], i) => {
          const services = CAP_SERVICES[i] ?? [];
          return (
            <section className={`band${i % 2 === 1 ? " tintbg" : ""}`} key={title}>
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
