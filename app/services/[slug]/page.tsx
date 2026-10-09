import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { ServiceFlow } from "@/components/marketing/ServiceFlow";
import { ServiceArt } from "@/components/marketing/ServiceArt";
import { CAPS } from "@/data/marketing";
import { SERVICES, getService } from "@/data/services";
import { SERVICE_DETAIL } from "@/data/service-detail";

export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) return { title: "Service not found" };
  return {
    // bare title: the root layout template appends "· Consult America"
    title: service.title,
    description: service.dek,
    openGraph: { title: service.title, description: service.dek, images: [service.image] },
  };
}

const ARROW = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const EXT = (
  <svg className="ext" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) notFound();

  const detail = SERVICE_DETAIL[service.slug];
  const capability = CAPS[service.cap][0];
  // Everything else under the same capability, for the sibling nav at the foot.
  const siblings = SERVICES.filter((s) => s.cap === service.cap && s.slug !== service.slug);

  return (
    <>
      <MarketingHeader />

      <main className="svc">
        <header className="svc-hero">
          <div className="wrap">
            <nav className="art-crumbs" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span aria-hidden>/</span>
              <Link href="/#capabilities">{capability}</Link>
              <span aria-hidden>/</span>
              <span aria-current="page">{service.title}</span>
            </nav>
            <h1>{service.title}</h1>
            <p className="svc-dek">{service.dek}</p>
            <div className="svc-cta">
              <Link href="/#contact" className="btn btn-primary">
                Discuss your project {ARROW}
              </Link>
              <a href="#learn" className="btn btn-ghost">
                Learn this field
              </a>
            </div>
          </div>
        </header>

        {/* A diagram of this specific field, not a reused stock photo.
            Becomes a player if per-service video is ever supplied. */}
        <div className="wrap">
          <figure className="svc-media">
            {service.video ? (
              <video src={service.video} poster={service.image} controls preload="none" playsInline />
            ) : (
              <ServiceArt slug={service.slug} cap={service.cap} />
            )}
          </figure>
        </div>

        <section className="band">
          <div className="wrap svc-body">
            <div className="svc-main">
              <section className="svc-sec" id="what">
                <h2>What is it?</h2>
                <p className="svc-lead">{service.what}</p>
                {detail ? (
                  <div className="svc-tech">
                    <span className="svc-tech-tag">For a technical reader</span>
                    <p>{detail.technical}</p>
                  </div>
                ) : null}
              </section>

              {detail ? (
                <section className="svc-sec" id="services">
                  <h2>Our services</h2>
                  <div className="svc-offer">
                    {detail.offer.map(([k, v]) => (
                      <article key={k}>
                        <b>{k}</b>
                        <span>{v}</span>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="svc-sec" id="covered">
                <h2>What&rsquo;s covered</h2>
                <dl className="svc-covers">
                  {service.covers.map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              {detail ? (
                <section className="svc-sec" id="problems">
                  <h2>Business problems we solve</h2>
                  <div className="svc-probs">
                    {detail.problems.map(([p, a]) => (
                      <article key={p}>
                        <b>
                          <span className="svc-prob-m" aria-hidden>
                            &ldquo;
                          </span>
                          {p}
                        </b>
                        <span>{a}</span>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="svc-sec" id="approach">
                <h2>Our delivery approach</h2>
                <ServiceFlow steps={service.approach.map(([t]) => t)} cap={service.cap} />
                <ol className="svc-steps">
                  {service.approach.map(([title, desc], i) => (
                    <li key={title}>
                      <span className="svc-step-n">{String(i + 1).padStart(2, "0")}</span>
                      <div>
                        <b>{title}</b>
                        <span>{desc}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              {detail ? (
                <section className="svc-sec" id="projects">
                  <h2>Solutions &amp; project types</h2>
                  <p className="svc-note">
                    Examples of the work we take on in this area. These describe project shapes, not named client
                    engagements.
                  </p>
                  <div className="svc-cases">
                    {detail.useCases.map(([k, v]) => (
                      <article key={k}>
                        <b>{k}</b>
                        <span>{v}</span>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {detail ? (
                <section className="svc-sec" id="tech">
                  <h2>Technologies &amp; platforms</h2>
                  <div className="svc-stack">
                    {detail.stack.map(([group, tools]) => (
                      <div key={group}>
                        <h3>{group}</h3>
                        <ul>
                          {tools.map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="svc-side">
              <div className="svc-card">
                <h3>What you get</h3>
                <ul className="svc-deliver">
                  {service.deliverables.map((d) => (
                    <li key={d}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      {d}
                    </li>
                  ))}
                </ul>
                <Link href="/#contact" className="btn btn-primary svc-card-cta">
                  Request a consultation {ARROW}
                </Link>
              </div>
            </aside>
          </div>
        </section>

        {detail ? (
          <section className="band tintbg" id="learn">
            <div className="wrap">
              <div className="sec-head">
                <span className="eyebrow">Learn this field</span>
                <h2>Where to start with {service.title.toLowerCase()}.</h2>
                <p>
                  Secondary to the work itself, but genuinely useful if you are building the skill. Every link goes to
                  official documentation or an official channel.
                </p>
              </div>

              <div className="svc-learn">
                <div className="svc-road">
                  {detail.learn.roadmap.map(([level, items]) => (
                    <article key={level}>
                      <h3>{level}</h3>
                      <ul>
                        {items.map((i) => (
                          <li key={i}>{i}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>

                <div className="svc-res">
                  <article>
                    <h3>Official documentation</h3>
                    <ul className="svc-links">
                      {detail.learn.docs.map(([label, url]) => (
                        <li key={url}>
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            {label} {EXT}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article>
                    <h3>Official video channels</h3>
                    <ul className="svc-links">
                      {detail.learn.channels.map(([label, url]) => (
                        <li key={url}>
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            {label} {EXT}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article>
                    <h3>Certifications</h3>
                    <ul className="svc-plain">
                      {detail.learn.certs.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </article>

                  <article>
                    <h3>Practice projects</h3>
                    <ul className="svc-plain">
                      {detail.learn.projects.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </article>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {detail ? (
          <section className="band" id="faq">
            <div className="wrap">
              <div className="sec-head">
                <span className="eyebrow">FAQs</span>
                <h2>Questions we get asked.</h2>
              </div>
              <div className="svc-faq">
                {detail.faqs.map(([q, a]) => (
                  <details key={q}>
                    <summary>
                      {q}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </summary>
                    <p>{a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {siblings.length ? (
          <section className="band tintbg">
            <div className="wrap">
              <div className="sec-head">
                <span className="eyebrow">{capability}</span>
                <h2>Related services.</h2>
              </div>
              <div className="svc-more">
                {siblings.map((s) => (
                  <Link className="svc-more-card" href={`/services/${s.slug}`} key={s.slug}>
                    <b>{s.title}</b>
                    <span>{s.dek}</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="band cta" id="contact">
          <div className="wrap cta-inner">
            <span className="eyebrow" style={{ color: "var(--cyan)", justifyContent: "center" }}>
              Start the conversation
            </span>
            <h2 style={{ marginTop: 18 }}>Talk to our experts about {service.title.toLowerCase()}.</h2>
            <p>Tell us where you are. A specialist will read it and reply within one business day.</p>
            <div className="cta-actions">
              <Link href="/#contact" className="btn btn-primary">
                Discuss your project {ARROW}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </>
  );
}
