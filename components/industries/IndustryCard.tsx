import Image from "next/image";
import Link from "next/link";

import type { Industry } from "@/data/industries";

/**
 * A photo card linking to an industry page. Used by the homepage Industries
 * section and by the "other industries" row at the foot of each page.
 *
 * The link sits on the heading and is stretched over the whole card with a
 * pseudo-element, so the card is one tab stop whose accessible name is the
 * industry name. Wrapping the whole card in <a> would make screen readers read
 * the summary and the "Explore" label as part of the link name. The photo is
 * decorative here: the heading already says what it shows.
 */
export function IndustryCard({
  industry,
  size = "standard",
}: {
  industry: Pick<Industry, "slug" | "name" | "group" | "summary" | "image" | "imagePosition">;
  size?: "large" | "standard";
}) {
  const large = size === "large";
  return (
    <article className={`ind-card${large ? " ind-card-lg" : ""}`}>
      <div className="ind-card-media">
        <Image
          src={industry.image}
          alt=""
          fill
          sizes={large ? "(max-width: 600px) 100vw, (max-width: 980px) 50vw, 620px" : "(max-width: 600px) 100vw, (max-width: 980px) 50vw, 410px"}
          style={industry.imagePosition ? { objectPosition: industry.imagePosition } : undefined}
        />
      </div>
      <div className="ind-card-body">
        <span className="ind-card-group">{industry.group}</span>
        <h3>
          <Link href={`/industries/${industry.slug}`} className="ind-card-link">
            {industry.name}
          </Link>
        </h3>
        <p>{industry.summary}</p>
        <span className="ind-card-go" aria-hidden>
          Explore
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </article>
  );
}
