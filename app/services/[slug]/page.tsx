import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { ServiceGlyph } from "@/components/marketing/ServiceGlyph";
import { CAPS } from "@/data/marketing";
import { SERVICES, getService } from "@/data/services";

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

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) notFound();

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
                Talk to an expert
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>
        </header>

        {/* A generated schematic, unique per slug, rather than a homepage photo
            reused across 25 pages. Becomes a player if video is ever set. */}
        <div className="wrap">
          <figure className="svc-media">
            {service.video ? (
              <video src={service.video} poster={service.image} controls preload="none" playsInline />
            ) : (
              <ServiceGlyph slug={service.slug} cap={service.cap} />
            )}
          </figure>
        </div>

        <section className="band">
          <div className="wrap svc-body">
            <div className="svc-main">
              <section className="svc-sec">
                <h2>What this is</h2>
                <p className="svc-lead">{service.what}</p>
              </section>

              <section className="svc-sec">
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

              <section className="svc-sec">
                <h2>How we do it</h2>
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
              </div>
            </aside>
          </div>
        </section>

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
            <h2 style={{ marginTop: 18 }}>Tell us where you are.</h2>
            <p>A specialist will read it and reply within one business day.</p>
            <div className="cta-actions">
              <Link href="/#contact" className="btn btn-primary">
                Talk to an expert
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
