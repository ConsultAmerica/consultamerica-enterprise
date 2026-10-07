"use client";

import { useEffect, useRef, useState } from "react";

import { CONTACT } from "@/data/marketing";

type ContactFabProps = {
  /** Opens the Ask-AI command palette (the same one ⌘K and the nav button use). */
  onAskAi?: () => void;
};

/**
 * Persistent bottom-right "Contact us" pill with a popover: a blue block with
 * the phone number on top, then the ways to reach a human.
 */
export function ContactFab({ onAskAi }: ContactFabProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`cfab${open ? " open" : ""}`} ref={rootRef}>
      {open ? (
        <div className="cfab-panel" role="dialog" aria-label="Contact Consult America">
          <div className="cfab-call">
            <span className="cfab-call-k">Call us at</span>
            <span className="cfab-call-c">{CONTACT.country}</span>
            <a className="cfab-call-n" href={`tel:${CONTACT.phoneHref}`}>
              {CONTACT.phone}
            </a>
            <span className="cfab-call-h">Mon&ndash;Fri, 9am&ndash;6pm ET</span>
          </div>

          <div className="cfab-rows">
            <button
              type="button"
              className="cfab-row"
              onClick={() => {
                setOpen(false);
                onAskAi?.();
              }}
            >
              <span className="cfab-ic">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z" />
                </svg>
              </span>
              <span className="cfab-tx">
                <b>Ask our AI</b>
                <span>Get a straight answer on scope, cost, or timeline right now.</span>
              </span>
            </button>

            <a className="cfab-row" href="#contact" onClick={() => setOpen(false)}>
              <span className="cfab-ic">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span className="cfab-tx">
                <b>Talk to an expert</b>
                <span>Tell us what you need and the right specialist replies.</span>
              </span>
            </a>

            <a className="cfab-row" href={`mailto:${CONTACT.email}`} onClick={() => setOpen(false)}>
              <span className="cfab-ic">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 5h18v14H3z" />
                  <path d="m3 6 9 7 9-7" />
                </svg>
              </span>
              <span className="cfab-tx">
                <b>Email us</b>
                <span>{CONTACT.email}</span>
              </span>
            </a>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="cfab-btn"
        aria-expanded={open}
        aria-label={open ? "Close contact options" : "Contact us"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.3-.6L3 21l1.8-5a8.3 8.3 0 0 1-.8-3.6A8.4 8.4 0 0 1 12.5 4h.5a8.4 8.4 0 0 1 8 7.5z" />
          </svg>
        )}
        <span>Contact us</span>
      </button>
    </div>
  );
}
