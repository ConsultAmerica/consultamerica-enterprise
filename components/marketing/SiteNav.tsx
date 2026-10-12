"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useState } from "react";

import { PRIMARY_NAV, isNavItemActive, navHref } from "@/components/marketing/nav-config";
import { CAPS, CAP_SERVICES, INDUSTRIES, PROD } from "@/data/marketing";
import { serviceHref } from "@/data/services";

/**
 * What sits underneath each nav item on a phone.
 *
 * THE BUG THIS FIXES. The mobile menu rendered PRIMARY_NAV as five flat links
 * and nothing else. Everything inside Capabilities, Industries and Products
 * lived only in the desktop hover panels, so on a phone the twenty-five
 * service pages and twelve products were unreachable from the navigation at
 * all. Tapping "Products" jumped to the contact form, which is not a product.
 *
 * Built from the same CAPS / CAP_SERVICES / INDUSTRIES / PROD arrays the
 * desktop mega panels read, so the two can no longer disagree about what the
 * site contains. serviceHref() resolves a service title to its page and
 * returns undefined when none exists yet; those entries are dropped rather
 * than linked to nowhere.
 */
type MobileChild = { label: string; href: string; external?: boolean };

function childrenFor(label: string): MobileChild[] {
  if (label === "Capabilities") {
    return CAPS.flatMap(([capability], i) => {
      const services = (CAP_SERVICES[i] ?? []).flatMap((title) => {
        const href = serviceHref(title);
        return href ? [{ label: title, href }] : [];
      });
      // The capability itself is a heading on the homepage, not a page, so it
      // is represented by its services rather than a link of its own.
      return services.length ? services : [];
      void capability;
    });
  }
  if (label === "Industries") {
    return INDUSTRIES.map(([name]) => ({ label: name, href: "/#industries" }));
  }
  if (label === "Products") {
    return PROD.map(([name, , href]) => ({ label: name, href, external: true }));
  }
  return [];
}

/**
 * Mobile menu: the same PRIMARY_NAV as desktop, with its contents reachable.
 *
 * An accordion rather than a second screen. A phone menu that pushes you into
 * a sub-page makes "go back one level" a thing you have to learn; expanding in
 * place keeps every other section one tap away and the whole structure
 * visible. Only one section is open at a time, because four expanded lists is
 * a wall of sixty links.
 */
export function MobileNavLinks({ onHome, onNavigate }: { onHome: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      {PRIMARY_NAV.map((item) => {
        const children = childrenFor(item.label);

        // Careers and Life have nothing underneath them: still plain links.
        if (children.length === 0) {
          return (
            <Link
              key={item.label}
              href={navHref(item, onHome)}
              aria-current={isNavItemActive(pathname, item) ? "page" : undefined}
              onClick={onNavigate}
            >
              {item.label}
            </Link>
          );
        }

        const expanded = open === item.label;
        const panelId = `m-${item.label.replace(/\W+/g, "-").toLowerCase()}`;

        return (
          <div className="mnav-group" key={item.label}>
            <button
              type="button"
              className={`mnav-trigger${expanded ? " is-open" : ""}`}
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setOpen(expanded ? null : item.label)}
            >
              {item.label}
              <span className="mnav-chev" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>

            {expanded ? (
              <div className="mnav-panel" id={panelId}>
                {/* The section's own destination stays reachable: someone who
                    opened Capabilities to browse may still have wanted the
                    overview they tapped on. */}
                <Link className="mnav-all" href={navHref(item, onHome)} onClick={onNavigate}>
                  All {item.label}
                </Link>
                {children.map((child) =>
                  child.external ? (
                    <a
                      key={child.label + child.href}
                      href={child.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={onNavigate}
                    >
                      {child.label}
                    </a>
                  ) : (
                    <Link key={child.label + child.href} href={child.href} onClick={onNavigate}>
                      {child.label}
                    </Link>
                  ),
                )}
              </div>
            ) : null}
          </div>
        );
      })}
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
