"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/candidate", label: "Dashboard" },
  { href: "/candidate/applications", label: "Applications" },
  { href: "/candidate/drafts", label: "Drafts" },
  { href: "/candidate/resumes", label: "Résumés" },
  { href: "/candidate/saved-jobs", label: "Saved jobs" },
  { href: "/candidate/profile", label: "Profile" },
] as const;

export function CandidateNav() {
  const pathname = usePathname();
  return (
    <nav className="ws-nav" aria-label="Candidate portal">
      {LINKS.map((link) => {
        const current = link.href === "/candidate" ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} aria-current={current ? "page" : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
