import type { MetadataRoute } from "next";

import { INDUSTRY_PAGES } from "@/data/industries";
import { INSIGHTS } from "@/data/insights";
import { SERVICES } from "@/data/services";
import { SITE_URL } from "@/lib/site";

/**
 * Every public marketing page. Individual job postings are left out: they live
 * in the database, open and close daily, and are reached from /jobs, which is
 * listed. Sign-in, workspace, admin and candidate-portal routes are excluded
 * here and disallowed in robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${path}`,
    priority,
  });

  return [
    page("/", 1),
    page("/industries", 0.9),
    ...INDUSTRY_PAGES.map((i) => page(`/industries/${i.slug}`, 0.9)),
    page("/capabilities", 0.9),
    ...SERVICES.map((s) => page(`/services/${s.slug}`, 0.8)),
    page("/products", 0.7),
    ...INSIGHTS.map((a) => ({ ...page(`/insights/${a.slug}`, 0.6), lastModified: a.dateISO })),
    page("/life", 0.6),
    page("/about", 0.5),
    page("/careers", 0.7),
    page("/jobs", 0.7),
  ];
}
