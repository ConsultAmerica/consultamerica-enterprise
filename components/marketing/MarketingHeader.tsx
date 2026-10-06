"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type MarketingHeaderProps = {
  /** Prefer solid chrome on light pages; transparent over navy heroes. */
  solid?: boolean;
};

export function MarketingHeader({ solid = true }: MarketingHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const solidNav = solid || scrolled;

  return (
    <header className={`nav${solidNav ? " solid" : ""}`} id="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="brand">
          <img className="logo" src="/logo-word.png?v=ca10" alt="Consult America" />
        </Link>
        <nav className="nav-mid" aria-label="Primary">
          <div className="nav-item">
            <Link href="/#capabilities">Capabilities</Link>
          </div>
          <div className="nav-item">
            <Link href="/#industries">Industries</Link>
          </div>
          <div className="nav-item">
            <Link href="/#contact">Products</Link>
          </div>
          <div className="nav-item">
            <Link href="/#ai">AI</Link>
          </div>
          <div className="nav-item">
            <Link href="/#talent">Talent</Link>
          </div>
          <div className="nav-item">
            <Link href="/#insights">Insights</Link>
          </div>
          <div className="nav-item">
            <Link href="/#careers">Careers</Link>
          </div>
          <div className="nav-item">
            <Link href="/jobs">Jobs</Link>
          </div>
        </nav>
        <div className="nav-right">
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
          <Link href="/#careers" onClick={() => setMenuOpen(false)}>
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
