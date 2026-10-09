"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Section nav for the Neon recruitment admin.
 *
 * A client component for one reason only: marking the current section needs the
 * live pathname, and a server layout cannot see the URL it renders. Everything
 * else in /admin stays a server component.
 *
 * All four destinations are linked unconditionally. /admin/jobs,
 * /admin/applications and /admin/candidates are being built in parallel with
 * this file; a nav that hid links until their pages landed would have to be
 * edited again the moment they did, and a link to a page that is still a
 * redirect is a far smaller problem than a nav with holes in it.
 */
const ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/candidates", label: "Candidates" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="ws-nav" aria-label="Recruitment admin">
      {ITEMS.map((item) => {
        // Prefix match on `${href}/`, not startsWith(href), so a detail route
        // (/admin/applications/<id>) or a child form (/admin/jobs/new) keeps its
        // parent section marked, while a hypothetical sibling such as
        // /admin/jobs-archive does not steal the highlight.
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
