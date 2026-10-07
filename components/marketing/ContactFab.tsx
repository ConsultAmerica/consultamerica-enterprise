"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { CONTACT } from "@/data/marketing";

type ContactFabProps = {
  /** Opens the Ask-AI command palette (the same one ⌘K and the nav button use). */
  onAskAi?: () => void;
};

/** 1.6-weight line icons on a 18px box. No filled shapes, no chat bubbles. */
const ICON_EXPERT = (
  <>
    <path d="M4 20v-1.5A4.5 4.5 0 0 1 8.5 14h3a4.5 4.5 0 0 1 4.5 4.5V20" />
    <circle cx="10" cy="7.5" r="3.5" />
    <path d="M17.5 4.5a4 4 0 0 1 0 7" />
  </>
);
const ICON_AI = (
  <>
    <path d="M12 3.5 13.4 8 18 9.4 13.4 10.8 12 15.3 10.6 10.8 6 9.4 10.6 8Z" />
    <path d="M18.4 15.2l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6Z" />
  </>
);
const ICON_GENERAL = (
  <>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="m3.8 6.8 8.2 6 8.2-6" />
  </>
);

type Route = {
  key: string;
  title: string;
  desc: string;
  icon: ReactNode;
  href?: string;
  onSelect?: () => void;
};

export function ContactFab({ onAskAi }: ContactFabProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll<HTMLElement>("[data-focusable]");
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    const t = setTimeout(
      () => panelRef.current?.querySelector<HTMLElement>("[data-focusable]")?.focus(),
      60,
    );
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  // Three paths only. "Talk to an expert" already appears in the nav and hero,
  // so this hub stays a utility: it routes, it doesn't re-sell.
  const routes: Route[] = [
    {
      key: "expert",
      title: "Talk to an expert",
      desc: "Engineering, AI & transformation",
      icon: ICON_EXPERT,
      href: "#contact",
    },
    {
      key: "ai",
      title: "Ask Consult AI",
      desc: "Get answers instantly",
      icon: ICON_AI,
      onSelect: onAskAi,
    },
    {
      key: "general",
      title: "General contact",
      desc: "Email, careers & other inquiries",
      icon: ICON_GENERAL,
      href: `mailto:${CONTACT.email}`,
    },
  ];

  const rowInner = (r: Route) => (
    <>
      <span className="chub-ic" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {r.icon}
        </svg>
      </span>
      <span className="chub-tx">
        <span className="chub-t">{r.title}</span>
        <span className="chub-d">{r.desc}</span>
      </span>
      <span className="chub-go" aria-hidden>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h13M12 6l6 6-6 6" />
        </svg>
      </span>
    </>
  );

  return (
    <div className={`chub${open ? " open" : ""}`} ref={rootRef}>
      <div className="chub-scrim" aria-hidden onClick={() => setOpen(false)} />

      <div className="chub-panel" ref={panelRef} role="dialog" aria-label="Contact Consult America">
        <span className="chub-grip" aria-hidden />

        <header className="chub-head">
          <h2>Let&rsquo;s build what&rsquo;s next.</h2>
          <p>Tell us where you&rsquo;d like to start.</p>
        </header>

        <div className="chub-rows">
          {routes.map((r) =>
            r.onSelect ? (
              <button
                key={r.key}
                type="button"
                className="chub-row"
                data-focusable
                tabIndex={open ? 0 : -1}
                onClick={() => {
                  setOpen(false);
                  r.onSelect?.();
                }}
              >
                {rowInner(r)}
              </button>
            ) : (
              <a
                key={r.key}
                href={r.href}
                className="chub-row"
                data-focusable
                tabIndex={open ? 0 : -1}
                onClick={() => setOpen(false)}
              >
                {rowInner(r)}
              </a>
            ),
          )}
        </div>

        <div className="chub-foot">
          <span>Prefer to talk?</span>
          <a href={`tel:${CONTACT.phoneHref}`} data-focusable tabIndex={open ? 0 : -1}>
            {CONTACT.phone}
          </a>
        </div>
      </div>

      <button
        type="button"
        className="chub-btn"
        ref={btnRef}
        aria-expanded={open}
        aria-label={open ? "Close contact options" : "Contact Consult America"}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="chub-btn-ic" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 8.5v7M8.5 12h7" />
          </svg>
        </span>
        <span className="chub-btn-t">Contact</span>
      </button>
    </div>
  );
}
