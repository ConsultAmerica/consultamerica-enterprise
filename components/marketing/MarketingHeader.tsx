"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AssistantPalette, type AssistantPageContext } from "@/components/assistant/AssistantPalette";
import { CONTACT_CTA, PRIMARY_NAV, isNavItemActive } from "@/components/marketing/nav-config";
import { ExpertForm } from "@/components/marketing/ExpertForm";
import { CHEV, MEGA_IDS, NavMegaPanel } from "@/components/marketing/PrimaryNav";
import { MobileNavLinks, useMobileMenuEscape } from "@/components/marketing/SiteNav";

const MENU_TOGGLE_ID = "navToggle";

type MarketingHeaderProps = {
  /** Prefer solid chrome on light pages; transparent over navy heroes. */
  solid?: boolean;
  /** Page context for the Ask AI assistant (e.g. the job being viewed). */
  assistantContext?: AssistantPageContext;
};

export function MarketingHeader({ solid = true, assistantContext = { page: "about" } }: MarketingHeaderProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  useMobileMenuEscape(menuOpen, setMenuOpen, MENU_TOGGLE_ID);
  const [scrolled, setScrolled] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const closeAsk = useCallback(() => setAskOpen(false), []);
  const [expertOpen, setExpertOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAskOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      // same dissipate-on-scroll-down behaviour as the homepage nav
      if (y <= 80) setHidden(false);
      else if (y > lastY + 4) setHidden(true);
      else if (y < lastY - 4) setHidden(false);
      lastY = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // /jobs pages sit on light backgrounds, so the islands start in their
  // scrolled (dark-brand, opaque-capsule) state rather than over a hero.
  const scrolledNav = solid || scrolled;

  return (
    <>
      <header className={`nav${scrolledNav ? " scrolled" : ""}${hidden ? " nav-gone" : ""}`} id="nav">
        <div className="wrap nav-inner">
          <Link href="/" className="brand">
            <img className="mark" src="/logo-mark3.png?v=m1" alt="" aria-hidden />
            <span className="bt">
              <span className="bw">
                <b>Consult</b> <em>America</em>
              </span>
              <span className="btag">AI Technology and Services</span>
            </span>
          </Link>
          <nav className="nav-mid" aria-label="Primary">
            {PRIMARY_NAV.map((item) =>
              item.mega ? (
                <div className="nav-item has-mega" key={item.label}>
                  <a href={item.href}>
                    {item.label} {CHEV}
                  </a>
                  <div className="mega" id={MEGA_IDS[item.mega]}>
                    <NavMegaPanel mega={item.mega} base="/" />
                  </div>
                </div>
              ) : (
                <div className="nav-item" key={item.label}>
                  <Link href={item.href} aria-current={isNavItemActive(pathname, item) ? "page" : undefined}>
                    {item.label}
                  </Link>
                </div>
              ),
            )}
          </nav>
          <div className="nav-right">
            <button type="button" className="ask-nav" aria-label="Ask Consult America AI" onClick={() => setAskOpen(true)}>
              <span className="spk">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z" />
                </svg>
              </span>
              Ask AI
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setExpertOpen(true)}>
              {CONTACT_CTA.label}{" "}
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              className="nav-toggle"
              id={MENU_TOGGLE_ID}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-controls={menuOpen ? "mobileMenu" : undefined}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            </button>
          </div>
        </div>
        {menuOpen ? (
          <div className="mobile-menu open" id="mobileMenu">
            <MobileNavLinks onHome={false} onNavigate={() => setMenuOpen(false)} />
            <button
              type="button"
              className="mobile-ask"
              onClick={() => {
                setMenuOpen(false);
                setAskOpen(true);
              }}
            >
              Ask AI
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setMenuOpen(false);
                setExpertOpen(true);
              }}
            >
              {CONTACT_CTA.label}
            </button>
          </div>
        ) : null}
      </header>
      <AssistantPalette open={askOpen} onClose={closeAsk} context={assistantContext} />
      <ExpertForm open={expertOpen} onClose={() => setExpertOpen(false)} />
    </>
  );
}
