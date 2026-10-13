import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * Public marketing and careers pages are crawlable. Workspace, admin, the
 * candidate portal, sign-in and API routes are not: they are behind auth, and
 * the admin pages already carry their own noindex.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // "/app$" and "/app/" rather than "/app": rules match by prefix, and a
      // bare "/app" would also block /apple-icon.png.
      disallow: ["/api/", "/app$", "/app/", "/admin", "/candidate", "/login", "/auth/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
