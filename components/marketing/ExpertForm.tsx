"use client";

import { useEffect, useRef, useState } from "react";

import { CONTACT } from "@/data/marketing";

const INTERESTS = [
  "Engineering",
  "AI & Data",
  "Oracle Cloud",
  "Enterprise Transformation",
  "Managed Services",
  "Specialized talent",
] as const;

type Status = { state: "idle" | "sending" } | { state: "sent"; via: string } | { state: "error"; message: string };

export function ExpertForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStatus({ state: "idle" });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    const t = setTimeout(() => firstRef.current?.focus(), 80);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    setStatus({ state: "sending" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setStatus({ state: "sent", via: data.via });
    } catch (err) {
      setStatus({ state: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }

  return (
    <div className="xf" role="dialog" aria-modal="true" aria-labelledby="xf-title">
      <div className="xf-scrim" onClick={onClose} aria-hidden />
      <div className="xf-panel" ref={panelRef}>
        <button type="button" className="xf-x" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {status.state === "sent" ? (
          <div className="xf-done">
            <span className="xf-tick" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <h2>Thanks, that&rsquo;s with us.</h2>
            <p>A specialist will read it and reply within one business day.</p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            <header className="xf-head">
              <h2 id="xf-title">Talk to an expert</h2>
              <p>Tell us where you are. We&rsquo;ll route it to the right specialist and reply within one business day.</p>
            </header>

            <form className="xf-form" onSubmit={onSubmit}>
              <div className="xf-row">
                <label className="xf-field">
                  <span>Full name</span>
                  <input ref={firstRef} name="name" required autoComplete="name" placeholder="Jane Okafor" />
                </label>
                <label className="xf-field">
                  <span>Work email</span>
                  <input name="email" type="email" required autoComplete="email" placeholder="jane@company.com" />
                </label>
              </div>

              <div className="xf-row">
                <label className="xf-field">
                  <span>Company</span>
                  <input name="company" required autoComplete="organization" placeholder="Company name" />
                </label>
                <label className="xf-field">
                  <span>
                    Phone <i>optional</i>
                  </span>
                  <input name="phone" type="tel" autoComplete="tel" placeholder="+1 555 000 0000" />
                </label>
              </div>

              <label className="xf-field">
                <span>What do you need help with?</span>
                <select name="interest" defaultValue={INTERESTS[0]}>
                  {INTERESTS.map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
              </label>

              <label className="xf-field">
                <span>Tell us about the work</span>
                <textarea
                  name="message"
                  required
                  rows={5}
                  placeholder="Current systems, what you're trying to change, and any timing that matters."
                />
              </label>

              {status.state === "error" ? <p className="xf-err">{status.message}</p> : null}

              <div className="xf-foot">
                <span className="xf-note">We use this only to reply. No marketing lists.</span>
                <button className="btn btn-primary" type="submit" disabled={status.state === "sending"}>
                  {status.state === "sending" ? "Sending…" : "Send"}
                  {status.state === "sending" ? null : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
