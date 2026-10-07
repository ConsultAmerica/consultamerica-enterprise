import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { INSIGHTS, getInsight } from "@/data/insights";

export function generateStaticParams() {
  return INSIGHTS.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getInsight(slug);
  if (!article) return { title: "Insight not found" };
  return {
    title: article.title,
    description: article.dek,
    openGraph: { title: article.title, description: article.dek, images: [article.image] },
  };
}

export default async function InsightPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getInsight(slug);
  if (!article) notFound();

  const more = INSIGHTS.filter((i) => i.slug !== article.slug);

  return (
    <>
      <MarketingHeader />

      <article className="art">
        <header className="art-head">
          <div className="wrap art-wrap">
            <nav className="art-crumbs" aria-label="Breadcrumb">
              <Link href="/">Home</Link>
              <span aria-hidden>/</span>
              <Link href="/#insights">Insights</Link>
              <span aria-hidden>/</span>
              <span aria-current="page">{article.kind}</span>
            </nav>
            <h1>{article.title}</h1>
            <p className="art-dek">{article.dek}</p>
            <div className="art-meta">
              <span className="art-kind">{article.kind}</span>
              <span className="dot" aria-hidden />
              <time dateTime={article.dateISO}>{article.date}</time>
              <span className="dot" aria-hidden />
              <span>{article.readTime}</span>
            </div>
          </div>
        </header>

        <div className="art-hero">
          <div className="wrap art-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={article.image} alt="" />
          </div>
        </div>

        <div className="wrap art-wrap art-body">
          {article.body.map((b, i) => {
            if (b.type === "h") return <h2 key={i}>{b.text}</h2>;
            if (b.type === "pull") return <blockquote key={i}>{b.text}</blockquote>;
            if (b.type === "list")
              return (
                <ul key={i}>
                  {b.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              );
            return <p key={i}>{b.text}</p>;
          })}

          <div className="art-cta">
            <p>Working through this on a live estate?</p>
            <Link href="/#contact" className="btn btn-primary">
              Talk to an expert
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>

        {more.length ? (
          <section className="art-more">
            <div className="wrap">
              <div className="sec-head">
                <span className="eyebrow">Keep reading</span>
              </div>
              <div className="art-more-grid">
                {more.map((m) => (
                  <Link key={m.slug} className="art-card" href={`/insights/${m.slug}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.image} alt="" />
                    <span className="art-card-body">
                      <span className="art-card-meta">
                        {m.kind}
                        <span className="dot" aria-hidden />
                        {m.readTime}
                      </span>
                      <span className="art-card-t">{m.title}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </article>

      <MarketingFooter />
    </>
  );
}
