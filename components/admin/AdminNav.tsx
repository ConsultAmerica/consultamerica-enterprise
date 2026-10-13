"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/**
 * Section nav for the recruitment admin.
 *
 * A client component for one reason only: marking the current section needs
 * the live pathname, and a server layout cannot see the URL it renders.
 * Everything else in /admin stays a server component.
 *
 * WHAT THIS NAV DOES THAT A ROW OF LINKS DOES NOT.
 *
 * 1. It carries a count. The badge on Applications is the number of
 *    submissions waiting on a first review, read from the database on every
 *    request. It is the one fact a recruiter needs from any screen in the
 *    product, and before this it was only visible by navigating to the place
 *    that would tell you. A nav that answers a question is worth more than a
 *    nav that only moves you.
 *
 * 2. Icons, because the four sections are recognised faster by shape than by
 *    reading, and because "Applications" and "Candidates" start with the same
 *    letter and are three characters apart in length. At a glance those two
 *    words are the same word.
 *
 * 3. The active section is marked twice over: a filled pill AND a cyan rule
 *    beneath it. Colour alone is not an accessible way to say "you are here",
 *    and aria-current carries it for anyone not looking at pixels at all.
 *
 * All four destinations are linked unconditionally. A link to a page that is
 * still a redirect is a far smaller problem than a nav with holes in it.
 */

const ICON = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS: Record<string, ReactNode> = {
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...ICON} aria-hidden>
      <path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z" />
    </svg>
  ),
  jobs: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...ICON} aria-hidden>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18" />
    </svg>
  ),
  applications: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...ICON} aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  ),
  candidates: (
    <svg width="16" height="16" viewBox="0 0 24 24" {...ICON} aria-hidden>
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" />
      <circle cx="10" cy="8" r="3.2" />
      <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.4 5.2a3.2 3.2 0 0 1 0 5.6" />
    </svg>
  ),
};

const ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/jobs", label: "Jobs", icon: "jobs" },
  { href: "/admin/applications", label: "Applications", icon: "applications" },
  { href: "/admin/candidates", label: "Candidates", icon: "candidates" },
];

type Props = {
  /**
   * Applications awaiting a first review. Null when the count could not be
   * read, which is deliberately different from 0: a nav that shows "0" during
   * a database outage is telling a recruiter there is no work, and that is the
   * kind of wrong answer somebody acts on. No number means no claim.
   */
  reviewCount?: number | null;
};

export function AdminNav({ reviewCount = null }: Props) {
  const pathname = usePathname();

  /*
    ELEVATION ON SCROLL, which is the one thing a sticky bar needs to not look
    broken. Page content slides underneath it, and with a flat bar the first
    line of text gets sliced in half at the boundary and reads as a rendering
    fault rather than as layering. A shadow that appears only once the page has
    moved says "this is in front" at exactly the moment it needs saying, and
    stays out of the way at rest.

    The flag goes on <html> rather than on the bar, so the rule can be written
    in CSS next to the bar's own styles and nothing has to be threaded through
    the layout. passive, because this listener never calls preventDefault and
    the browser should not have to wait for it before scrolling.
  */
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      root.toggleAttribute("data-scrolled", window.scrollY > 4);
    };
    apply();
    window.addEventListener("scroll", apply, { passive: true });
    return () => {
      window.removeEventListener("scroll", apply);
      root.removeAttribute("data-scrolled");
    };
  }, []);

  return (
    <nav className="sb-nav" aria-label="Recruitment admin">
      {ITEMS.map((item) => {
        // Prefix match on `${href}/`, not startsWith(href), so a detail route
        // (/admin/applications/<id>) or a child form (/admin/jobs/new) keeps
        // its parent section marked, while a hypothetical sibling such as
        // /admin/jobs-archive does not steal the highlight.
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const badge =
          item.href === "/admin/applications" && reviewCount !== null && reviewCount > 0
            ? reviewCount
            : null;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`sb-item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="sb-item-icon">{ICONS[item.icon]}</span>
            <span className="sb-item-label">{item.label}</span>
            {badge !== null ? (
              <span className="sb-count">
                {/* Capped, because a three-digit badge stretches the nav item
                    and the exact number stops mattering long before 99. */}
                {badge > 99 ? "99+" : badge}
                <span className="sr-only"> awaiting review</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
