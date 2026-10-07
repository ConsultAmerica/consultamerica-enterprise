"use client";

import Link from "next/link";

import { PrimaryNav } from "@/components/marketing/PrimaryNav";
import { useEffect, useState } from "react";

type MarketingHeaderProps = {
  /** Prefer solid chrome on light pages; transparent over navy heroes. */
  solid?: boolean;
};

export function MarketingHeader({ solid = true }: MarketingHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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
    <header className={`nav${scrolledNav ? " scrolled" : ""}${hidden ? " nav-gone" : ""}`} id="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="brand">
          <img className="mark" src="/logo-mark3.png?v=m1" alt="" aria-hidden />
          <span className="bt">
            <span className="bw">
              <b>Consult</b> <em>America</em>
            </span>
          </span>
        </Link>
        <PrimaryNav base="/" />
        <div className="nav-right">
          <Link href="/?ask=1" className="ask-nav" aria-label="Ask Consult America AI">
            <span className="spk">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z" />
              </svg>
            </span>
            Ask AI
          </Link>
          <Link href="/#contact" className="btn btn-primary btn-sm">
            Talk to an expert{" "}
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
          </Link>
          <button
            type="button"
            className="nav-toggle"
            aria-label="Menu"
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
          <Link href="/#capabilities" onClick={() => setMenuOpen(false)}>
            Capabilities
          </Link>
          <Link href="/#industries" onClick={() => setMenuOpen(false)}>
            Industries
          </Link>
          <Link href="/#contact" onClick={() => setMenuOpen(false)}>
            Products
          </Link>
          <Link href="/#ai" onClick={() => setMenuOpen(false)}>
            AI
          </Link>
          <Link href="/#talent" onClick={() => setMenuOpen(false)}>
            Talent
          </Link>
          <Link href="/#insights" onClick={() => setMenuOpen(false)}>
            Insights
          </Link>
          <Link href="/careers" onClick={() => setMenuOpen(false)}>
            Careers
          </Link>
          <Link href="/jobs" onClick={() => setMenuOpen(false)}>
            Jobs
          </Link>
          <Link href="/#contact" className="btn btn-primary" onClick={() => setMenuOpen(false)}>
            Talk to an expert
          </Link>
        </div>
      ) : null}
    </header>
  );
}
