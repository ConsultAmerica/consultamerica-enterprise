"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { PRIMARY_NAV, isNavItemActive, navHref } from "@/components/marketing/nav-config";

/** Mobile menu links: the same PRIMARY_NAV as desktop. */
export function MobileNavLinks({ onHome, onNavigate }: { onHome: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {PRIMARY_NAV.map((item) => (
        <Link
          key={item.label}
          href={navHref(item, onHome)}
          aria-current={isNavItemActive(pathname, item) ? "page" : undefined}
          onClick={onNavigate}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}

/** Escape closes the mobile menu and returns focus to its toggle. */
export function useMobileMenuEscape(open: boolean, setOpen: (open: boolean) => void, toggleId: string) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      document.getElementById(toggleId)?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen, toggleId]);
}
