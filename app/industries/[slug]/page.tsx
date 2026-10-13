import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CapabilityIcon } from "@/components/industries/CapabilityIcon";
import { ExpertCta } from "@/components/industries/ExpertCta";
import { IndustryCard } from "@/components/industries/IndustryCard";
import { IndustryFaq } from "@/components/industries/IndustryFaq";
import { IndustryHero } from "@/components/industries/IndustryHero";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { CAPS } from "@/data/marketing";
import { INDUSTRY_PAGES, getIndustry } from "@/data/industries";
import { getInsight, type Insight } from "@/data/insights";
import { getService, type Service } from "@/data/services";
import { SITE_URL } from "@/lib/site";

// Five known pages; anything else under /industries is a 404, not a render.
export const dynamicParams = false;

export function generateStaticParams() {
  return INDUSTRY_PAGES.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const industry = getIndustry(slug);
  if (!industry) return { title: "Industry not found" };
  // bare title: the root layout template appends "· Consult America"
  const title = `${industry.name} Technology Consulting`;
  return {
    title,
    description: industry.description,
    alternates: { canonical: `/industries/${industry.slug}` },
    openGraph: { title, description: industry.description, images: [industry.image] },
  };
}

const CHECK = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const ARROW = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const industry = getIndustry(slug);
  if (!industry) notFound();

  const services = industry.services.map(getService).filter((s): s is Service => Boolean(s));
  const insights = industry.insights.map(getInsight).filter((a): a is Insight => Boolean(a));
  const others = INDUSTRY_PAGES.filter((i) => i.slug !== industry.slug);
  const lower = industry.name.toLowerCase();

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Industries", item: `${SITE_URL}/industries` },
      { "@type": "ListItem", position: 3, name: industry.name, item: `${SITE_URL}/industries/${industry.slug}` },
    ],
  };

  return (
    <>
      <MarketingHeader solid={false} assistantContext={{ page: "home" }} />

      <main className="indp">
        <IndustryHero industry={industry} />

        {/* 2. Challenges */}
        <section className="band" id="challenges" aria-labelledby="challenges-h">
          <div className="wrap indp-split">
            <div className="sec-head">
              <span className="eyebrow">Industry challenges</span>
              <h2 id="challenges-h">What gets in the way.</h2>
              <p>{industry.challenge.lead}</p>
            </div>
            <ol className="indp-challenges">
              {industry.challenge.items.map(([title, body], i) => (
                <li key={title}>
                  <span className="indp-num" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 3. How we help */}
        <section className="band darkbg indp-help" id="help" aria-labelledby="help-h">
          <div className="wrap">
            <div className="indp-help-head">
              <div>
                <span className="eyebrow">How Consult America helps</span>
                <h2 id="help-h">From the core system to the data around it.</h2>
              </div>
              <p>{industry.help.lead}</p>
            </div>
            <ul className="indp-help-points">
              {industry.help.points.map(([title, body]) => (
                <li key={title}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 4. Solution areas */}
        <section className="band" id="solutions" aria-labelledby="solutions-h">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Solution areas</span>
              <h2 id="solutions-h">Where we focus in {lower}.</h2>
              <p>Each area is delivered by the same team that designs it, from assessment through production support.</p>
            </div>
            <ul className="indp-solutions">
              {industry.solutions.map((s, i) => {
                const service = s.service ? getService(s.service) : undefined;
                return (
                  <li key={s.title}>
                    <span className="indp-num" aria-hidden>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                    <ul className="svc-deliver">
                      {s.includes.map((item) => (
                        <li key={item}>
                          {CHECK}
                          {item}
                        </li>
                      ))}
                    </ul>
                    {service ? (
                      <Link className="indp-sol-link" href={`/services/${service.slug}`}>
                        <span className="indp-sol-link-k">Related service</span>
                        <span className="indp-sol-link-v">
                          {service.title} {ARROW}
                        </span>
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* 5. Capabilities */}
        <section className="band tintbg" id="capabilities" aria-labelledby="capabilities-h">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Capabilities</span>
              <h2 id="capabilities-h">Oracle Cloud, AI, data, integration and cloud.</h2>
              <p>The platforms and practices behind the solution areas, as they apply to {lower}.</p>
            </div>
            <ul className="indp-caps">
              {industry.capabilities.map((c) => (
                <li key={c.family}>
                  <span className="indp-cap-icon">
                    <CapabilityIcon family={c.family} />
                  </span>
                  <h3>{c.family}</h3>
                  <p>{c.purpose}</p>
                  <ul>
                    {c.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 6. Use cases */}
        <section className="band" id="use-cases" aria-labelledby="use-cases-h">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Use cases</span>
              <h2 id="use-cases-h">Practical business use cases.</h2>
              <p>
                Examples of the work this involves. They describe the shape of a project, not a named client
                engagement.
              </p>
            </div>
            <ul className="indp-cases">
              {industry.useCases.map(([title, body], i) => (
                <li key={title}>
                  <span className="indp-case-tag">Use case {String(i + 1).padStart(2, "0")}</span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 7. Delivery approach */}
        <section className="band tintbg" id="approach" aria-labelledby="approach-h">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Delivery approach</span>
              <h2 id="approach-h">How an engagement runs.</h2>
              <p>Strategy, design, build and run, applied to the realities of {lower}.</p>
            </div>
            <ol className="indp-steps">
              {industry.approach.map(([title, body], i) => (
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

        {/* Proof. Case studies render only once the business has approved
            one for publication; until then this shows the published
            perspective pieces, labelled as such rather than as proof. */}
        {industry.caseStudies.length || insights.length ? (
          <section className="band" id="proof" aria-labelledby="proof-h">
            <div className="wrap">
              <div className="sec-head">
                <span className="eyebrow">{industry.caseStudies.length ? "Client work" : "Perspectives"}</span>
                <h2 id="proof-h">
                  {industry.caseStudies.length ? `Work in ${lower}.` : "How we think about this work."}
                </h2>
              </div>
              {industry.caseStudies.length ? (
                <ul className="indp-proof">
                  {industry.caseStudies.map((c) => (
                    <li key={c.title} className="indp-case-study">
                      <span className="indp-case-tag">{c.client}</span>
                      <h3>{c.title}</h3>
                      <p>{c.summary}</p>
                      <ul className="svc-deliver">
                        {c.outcomes.map((o) => (
                          <li key={o}>
                            {CHECK}
                            {o}
                          </li>
                        ))}
                      </ul>
                      {c.href ? (
                        <Link className="arrowlink" href={c.href}>
                          Read the case study {ARROW}
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {insights.length ? (
                <ul className="indp-proof indp-insights">
                  {insights.map((a) => (
                    <li key={a.slug}>
                      <Link className="indp-insight" href={`/insights/${a.slug}`}>
                        <span className="indp-insight-media">
                          <Image src={a.image} alt="" fill sizes="(max-width: 680px) 100vw, 220px" />
                        </span>
                        <span className="indp-insight-body">
                          <span className="indp-case-tag">
                            {a.kind} · {a.readTime}
                          </span>
                          <b>{a.title}</b>
                          <span>{a.dek}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* 8. Related services */}
        {services.length ? (
          <section className="band tintbg" id="services" aria-labelledby="services-h">
            <div className="wrap">
              <div className="sec-head">
                <span className="eyebrow">Related services</span>
                <h2 id="services-h">The services behind this work.</h2>
              </div>
              <div className="svc-more">
                {services.map((s) => (
                  <Link className="svc-more-card" href={`/services/${s.slug}`} key={s.slug}>
                    <span className="indp-svc-cap">{CAPS[s.cap][0]}</span>
                    <b>{s.title}</b>
                    <span>{s.dek}</span>
                    {ARROW}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* 9. FAQ */}
        <section className="band" id="faq" aria-labelledby="faq-h">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">FAQs</span>
              <h2 id="faq-h">Questions about {lower}.</h2>
            </div>
            <IndustryFaq faqs={industry.faqs} />
          </div>
        </section>

        <section className="band tintbg" aria-labelledby="others-h">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Industries</span>
              <h2 id="others-h">Other industries we serve.</h2>
            </div>
            <ul className="indp-others">
              {others.map((o) => (
                <li key={o.slug}>
                  <IndustryCard industry={o} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 10. Contact */}
        <section className="band cta" id="contact">
          <div className="wrap cta-inner">
            <span className="eyebrow" style={{ color: "var(--cyan)", justifyContent: "center" }}>
              Start the conversation
            </span>
            <h2 style={{ marginTop: 18 }}>Talk to an expert about {lower}.</h2>
            <p>Tell us where you are and what you need to change. A specialist will read it and reply within one business day.</p>
            <div className="cta-actions">
              <ExpertCta />
              <a
                href="https://calendly.com/contact-consultamerica/30min"
                className="btn btn-ghost"
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a 30-min call
              </a>
            </div>
          </div>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs).replace(/</g, "\\u003c") }}
        />
      </main>

      <MarketingFooter />
    </>
  );
}
