import type { Metadata } from "next";
import Link from "next/link";

import { ExpertCta } from "@/components/industries/ExpertCta";
import { IndustryCard } from "@/components/industries/IndustryCard";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { CAPABILITY_FAMILIES, INDUSTRY_PAGES } from "@/data/industries";

export const metadata: Metadata = {
  title: "Industries",
  description:
    "Oracle Cloud, data, AI and integration for financial services, the public sector, supply chain, manufacturing and retail.",
  alternates: { canonical: "/industries" },
  openGraph: {
    title: "Industries",
    description:
      "Oracle Cloud, data, AI and integration for financial services, the public sector, supply chain, manufacturing and retail.",
    images: ["/img/industries/supply-chain.jpg"],
  },
};

/** What is the same in every sector: the delivery model, in the About page's four phases. */
const DELIVERY = [
  ["Strategy", "An honest assessment of what to modernize, replace or leave alone, before budget is committed."],
  ["Design", "Standard platform functionality first, with each customization justified against its upgrade cost."],
  ["Build", "Delivered in slices with your own data, so the business signs off on what it has actually used."],
  ["Run", "Application support, monitoring and continuous improvement after go-live, by the team that built it."],
] as const;

export default function IndustriesPage() {
  return (
    <>
      <MarketingHeader solid={false} assistantContext={{ page: "home" }} />

      <main className="indh">
        <header className="indh-hero">
          <div className="wrap">
            <nav className="art-crumbs" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span aria-hidden>/</span>
              <span aria-current="page">Industries</span>
            </nav>
            <p className="eyebrow indp-hero-eyebrow">Industries</p>
            <h1>
              Context that shortens the <span className="g">distance to value.</span>
            </h1>
            <p className="indh-dek">
              Five sectors where we bring Oracle Cloud, data, AI and integration together. Each page sets out the
              challenges, the solution areas, the use cases and how we deliver.
            </p>
          </div>
        </header>

        <section className="band darkbg indh-grid-band" aria-labelledby="indh-list-h">
          <div className="wrap">
            <h2 id="indh-list-h" className="sr-only">
              Industries we serve
            </h2>
            <ul className="ind-cards">
              {INDUSTRY_PAGES.map((industry, i) => (
                <li key={industry.slug}>
                  <IndustryCard industry={industry} size={i < 2 ? "large" : "standard"} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="band" aria-labelledby="indh-matrix-h">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">At a glance</span>
              <h2 id="indh-matrix-h">Where we focus in each sector.</h2>
              <p>
                Every page covers the same {CAPABILITY_FAMILIES.length} capability families, applied to what that
                sector actually needs.
              </p>
            </div>
            <div className="indh-matrix">
              {INDUSTRY_PAGES.map((industry) => (
                <article key={industry.slug}>
                  <h3>
                    <Link href={`/industries/${industry.slug}`}>{industry.name}</Link>
                  </h3>
                  <ul>
                    {industry.themes.map((theme) => (
                      <li key={theme}>{theme}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="band tintbg" aria-labelledby="indh-delivery-h">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Delivery approach</span>
              <h2 id="indh-delivery-h">One way of working, in every sector.</h2>
              <p>The context changes from industry to industry. The discipline behind the delivery does not.</p>
            </div>
            <ol className="indp-steps">
              {DELIVERY.map(([title, body], i) => (
                <li key={title}>
                  <span className="indp-step-n" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="band cta" id="contact">
          <div className="wrap cta-inner">
            <span className="eyebrow" style={{ color: "var(--cyan)", justifyContent: "center" }}>
              Start the conversation
            </span>
            <h2 style={{ marginTop: 18 }}>Not sure where your work fits?</h2>
            <p>Tell us where you are. A specialist will read it and reply within one business day.</p>
            <div className="cta-actions">
              <ExpertCta />
              <Link href="/capabilities" className="btn btn-ghost">
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
