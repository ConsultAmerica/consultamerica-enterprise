/**
 * The public origin search engines should index. Fixed rather than read from
 * NEXT_PUBLIC_SITE_URL: that variable feeds emailed links and differs between
 * preview and production deployments, and a preview URL must never become a
 * canonical. Both consultamerica.com and www.consultamerica.com serve the site;
 * canonical links point every page at the bare domain so the two are not
 * indexed as duplicates.
 */
export const SITE_URL = "https://consultamerica.com";
