import Image from "next/image";
import Link from "next/link";

import { ExpertCta } from "@/components/industries/ExpertCta";
import type { Industry } from "@/data/industries";

/**
 * Full-bleed photo hero for an industry page. The photo sits under a navy
 * gradient heavy enough on the left that the headline holds contrast whatever
 * the image does, and the five service themes run along the foot as a
 * summary of the page.
 */
export function IndustryHero({ industry }: { industry: Industry }) {
  return (
    <header className="indp-hero">
      <div className="indp-hero-media">
        <Image
          src={industry.image}
          alt={industry.imageAlt}
          fill
          sizes="100vw"
          loading="eager"
          fetchPriority="high"
          style={industry.imagePosition ? { objectPosition: industry.imagePosition } : undefined}
        />
      </div>
      <div className="wrap indp-hero-inner">
        <nav className="art-crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden>/</span>
          <Link href="/industries">Industries</Link>
          <span aria-hidden>/</span>
          <span aria-current="page">{industry.name}</span>
        </nav>
        <p className="eyebrow indp-hero-eyebrow">{industry.name}</p>
        <h1>{industry.headline}</h1>
        <p className="indp-hero-dek">{industry.dek}</p>
        <div className="indp-hero-cta">
          <ExpertCta />
          <a href="#solutions" className="btn btn-ghost">
            Explore solutions
          </a>
        </div>
      </div>
      <div className="wrap">
        <ul className="indp-themes" aria-label={`${industry.name} focus areas`}>
          {industry.themes.map((theme, i) => (
            <li key={theme}>
              <span aria-hidden>{String(i + 1).padStart(2, "0")}</span>
              {theme}
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}
