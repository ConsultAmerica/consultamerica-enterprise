import type { Metadata } from "next";
import Link from "next/link";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { PROD } from "@/data/marketing";

export const metadata: Metadata = {
  title: "Products",
  description:
    "Software Consult America has designed, built and shipped: AI hiring, document intelligence, healthcare guidance, commerce and booking platforms.",
};

/**
 * The Products page.
 *
 * WHY IT EXISTS. "Products" has been in the main navigation with no
 * destination of its own: its href was /#contact, so clicking it scrolled the
 * visitor to the contact form. The twelve products were reachable only by
 * hovering the desktop mega panel, which meant they did not exist at all on a
 * phone, and a visitor who clicked the word in the nav was shown a form
 * instead of the thing they asked to see.
 *
 * Every entry comes from PROD in data/marketing.ts, the same array the mega
 * panel and the mobile menu read, so the three cannot disagree about what has
 * been built.
 *
 * Copy is deliberately thin. The one-line descriptor on each card is the one
 * already published in the nav; inventing feature lists, client names or
 * outcomes for twelve products would put unverifiable claims on a company
 * site. The products speak for themselves at their own URLs.
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

const EXTERNAL = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

export default function ProductsPage() {
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
              Products
            </span>
            <h1>
              Not a portfolio of pilots.
              <br />
              <span className="g">Software that shipped.</span>
            </h1>
            <p>
              Each of these was designed, built and put into production by Consult America. They are
              live products with real users, not prototypes or case-study mockups.
            </p>
          </div>
        </section>

        <section className="band">
          <div className="wrap">
            <ul className="prod-grid">
              {PROD.map(([name, tagline, href, image]) => (
                <li key={name}>
                  {/*
                    A plain <a>, not next/link: every product lives on its own
                    domain. target="_blank" keeps this page open behind it, and
                    rel="noopener" is required with it — without it the opened
                    page gets a handle on this window and can redirect it.
                  */}
                  <a className="prod-card" href={href} target="_blank" rel="noopener noreferrer">
                    <span className="prod-logo">
                      {/* Decorative: the product name is in the heading right
                          beside it, so announcing the logo would read the same
                          name twice. */}
                      <img src={image} alt="" aria-hidden loading="lazy" />
                    </span>
                    <span className="prod-body">
                      <strong>{name}</strong>
                      <span className="prod-tag">{tagline}</span>
                    </span>
                    <span className="prod-go" aria-hidden>
                      {EXTERNAL}
                    </span>
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="band cta">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Build something</span>
              <h2>Most of these started as someone&rsquo;s internal problem.</h2>
              <p>
                If you have one of those, the fastest way to find out what it would take is to
                describe it to someone who has built the others.
              </p>
            </div>
            <div className="cta-actions">
              <Link href="/#contact" className="btn btn-primary">
                Talk to an expert {ARROW}
              </Link>
              <Link href="/#capabilities" className="btn btn-ghost">
                Explore capabilities
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
