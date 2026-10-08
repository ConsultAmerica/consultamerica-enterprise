"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/app/recruiting", label: "Overview", exact: true },
  { href: "/app/recruiting/jobs", label: "Jobs" },
  { href: "/app/recruiting/candidates", label: "Candidates" },
  { href: "/app/recruiting/applications", label: "Applications" },
  { href: "/app/recruiting/job-intake", label: "Job Intake" },
  { href: "/app/recruiting/candidate-match", label: "Candidate Match" },
];

export function WorkspaceNav() {
  const pathname = usePathname();
  return (
    <nav className="ws-nav" aria-label="Recruiting">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
