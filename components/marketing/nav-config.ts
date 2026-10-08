/**
 * Single source for the marketing navigation. Both headers — the homepage
 * (EnterpriseHome.tsx, in-page anchors + mega panels) and every other page
 * (MarketingHeader.tsx, absolute links) — render from these lists, so the
 * two can no longer drift apart.
 */

export type MegaKey = "capabilities" | "industries" | "products";

export type PrimaryNavItem = {
  label: string;
  /** Link used on every page except the homepage. */
  href: string;
  /** In-page anchor used on the homepage instead of `href`, when there is one. */
  anchor?: string;
  /** Homepage only: renders the matching hover mega panel. */
  mega?: MegaKey;
  /** Other pages this link also counts as current for. */
  alsoActiveOn?: readonly string[];
};

export const PRIMARY_NAV: readonly PrimaryNavItem[] = [
  { label: "About", href: "/about" },
  { label: "Capabilities", href: "/#capabilities", anchor: "#capabilities", mega: "capabilities" },
  { label: "Industries", href: "/#industries", anchor: "#industries", mega: "industries" },
  // Products has no destination of its own yet (the homepage mega panel lists
  // the live products; the trigger itself falls through to Contact). Kept as-is
  // until a Products section or page is approved.
  { label: "Products", href: "/#contact", anchor: "#contact", mega: "products" },
  { label: "AI", href: "/#ai", anchor: "#ai" },
  { label: "Insights", href: "/#insights", anchor: "#insights" },
  // One plain link for both pages: /careers, also current on /jobs and job detail
  // pages. Jobs is reached from the Careers page CTAs.
  { label: "Careers", href: "/careers", alsoActiveOn: ["/jobs"] },
];

/** Cross-page calls to action between the two Careers pages. */
export const SEARCH_OPEN_JOBS = { label: "Search Open Jobs", href: "/jobs" } as const;
export const LEARN_ABOUT_CAREERS = { label: "Learn About Careers", href: "/careers" } as const;

export const CONTACT_CTA = { label: "Talk to an expert", href: "/#contact", anchor: "#contact" } as const;

export function navHref(item: { href: string; anchor?: string }, onHome: boolean): string {
  return onHome && item.anchor ? item.anchor : item.href;
}

/** True when `pathname` is the item's page, or one of its alsoActiveOn pages (children included). */
export function isNavItemActive(pathname: string | null, item: Pick<PrimaryNavItem, "href" | "alsoActiveOn">): boolean {
  return [item.href, ...(item.alsoActiveOn ?? [])].some((href) => isActivePath(pathname, href));
}

/** True when `pathname` is the link's page or one of its children (/jobs/x → /jobs). */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname || !href.startsWith("/") || href.includes("#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
