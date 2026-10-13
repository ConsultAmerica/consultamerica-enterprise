"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ExpertForm } from "@/components/marketing/ExpertForm";

/** Mirrors lib/assistant/engine.ts types (client bundle must not import server code). */
/**
 * Whether the Ask AI assistant is offered anywhere on the site.
 *
 * OFF, by request. Every entry point reads this one value: the two buttons in
 * MarketingHeader (desktop nav and mobile menu), the two on the homepage, and
 * the Ask AI item in the floating contact button. With it off, none of them
 * render and the palette is never mounted, so no assistant request can be made
 * from the UI at all.
 *
 * NOTHING WAS DELETED. The palette below, lib/assistant/* (the engine, the
 * company knowledge, the deterministic answers, the rate limiter) and the API
 * route are all untouched, as are their tests. Flipping this to true brings the
 * assistant back exactly as it was.
 *
 * The API route is deliberately NOT gated by this. A flag in a client bundle
 * is not a security control, and the route has its own rate limiting; turning
 * off the UI is a product decision, not a lockdown.
 */
export const ASSISTANT_ENABLED = false;

export type AssistantPageContext =
  | { page: "home" | "about" | "careers" | "jobs" }
  | { page: "job"; jobSlug: string };

type JobCard = {
  slug: string;
  title: string;
  company: string;
  location: string;
  workplaceType: string;
  employmentType: string;
  viewHref: string;
  applyHref: string;
  applyIsExternal: boolean;
};

type Reply = {
  status: "ok" | "fallback" | "limited" | "invalid";
  reply: string;
  jobs?: JobCard[];
  links?: { label: string; href: string; action?: "talk_to_expert" }[];
  grounding?: ("jobs" | "company" | "careers" | "application")[];
};

type Turn = { role: "user"; content: string } | { role: "assistant"; content: string; data: Reply };

const SUGGESTIONS: Record<"home" | "careers" | "job", string[]> = {
  home: [
    "What does Consult America do?",
    "Do you work with Oracle Cloud?",
    "Where are your offices?",
    "What jobs are open?",
    "Can I book a call with an expert?",
  ],
  careers: [
    "What jobs are open?",
    "Do you have remote roles?",
    "How does your hiring process work?",
    "How do I apply?",
  ],
  job: ["What skills does this role require?", "Is this position hybrid?", "Where is this role located?", "How do I apply?"],
};

const GROUNDING_LABEL: Record<string, string> = {
  jobs: "current public job listings",
  company: "approved company information",
  careers: "approved careers information",
  application: "the Easy Apply process",
};

const SEARCH_ICO = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
const SARR = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

const UNAVAILABLE: Reply = {
  status: "fallback",
  reply: "I can't answer right now. You can browse current openings on the Jobs page.",
  links: [{ label: "View Jobs", href: "/jobs" }],
};

type AssistantPaletteProps = {
  open: boolean;
  onClose: () => void;
  context: AssistantPageContext;
};

/**
 * "Ask AI" palette (same .cmdk visual language as before). Answers come from
 * /api/assistant, which only reads public job listings and approved copy.
 */
export function AssistantPalette({ open, onClose, context }: AssistantPaletteProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  // The palette owns its own "Talk to an expert" form, so a booking request in
  // chat opens the same enquiry form the header button does, on any page.
  const [expertOpen, setExpertOpen] = useState(false);
  const talkToExpert = () => {
    onClose();
    setExpertOpen(true);
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    const root = document.documentElement;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      root.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, pending]);

  const ask = async (question: string) => {
    const text = question.trim().slice(0, 1000);
    if (!text || pending) return;
    const history = [...turns, { role: "user", content: text } as Turn];
    setTurns(history);
    setInput("");
    setPending(true);
    let data: Reply = UNAVAILABLE;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The server keeps no state; send the recent conversation only.
          messages: history.slice(-11).map((t) => ({ role: t.role, content: t.content.slice(0, 1000) })),
          context,
        }),
      });
      const parsed = (await res.json()) as Reply;
      if (parsed && typeof parsed.reply === "string") data = parsed;
    } catch {
      data = UNAVAILABLE;
    }
    setTurns([...history, { role: "assistant", content: data.reply, data }]);
    setPending(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };

  const suggestions = SUGGESTIONS[context.page === "job" ? "job" : context.page === "home" || context.page === "about" ? "home" : "careers"];
  const placeholder =
    context.page === "job" ? "Ask about this role…" : "Ask about Consult America, careers, or open roles…";

  return (
    <>
    <div
      className={`cmdk${open ? " open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Ask Consult America AI"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmdk-panel">
        <form className="cmdk-input-row" onSubmit={onSubmit}>
          <span className="spk">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2l1.9 5.4 5.4 1.9-5.4 1.9L12 16l-1.9-5.4L4.7 9l5.4-1.9z" />
            </svg>
          </span>
          <input
            ref={inputRef}
            autoComplete="off"
            spellCheck={false}
            maxLength={1000}
            aria-label="Your question"
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={pending}
          />
          <button type="button" className="cmdk-esc" onClick={onClose} aria-label="Close">
            <kbd>Esc</kbd>
          </button>
        </form>

        <div className="cmdk-body" ref={bodyRef} aria-live="polite">
          {turns.map((turn, index) =>
            turn.role === "user" ? (
              <div key={index} className="cmdk-user">
                {turn.content}
              </div>
            ) : (
              <AnswerBlock key={index} reply={turn.data} onNavigate={onClose} onTalkToExpert={talkToExpert} />
            ),
          )}
          {pending ? <div className="cmdk-answer cmdk-pending">Looking that up…</div> : null}

          {!pending ? (
            <>
              <div className="cmdk-label">{turns.length ? "Keep exploring" : "Suggested"}</div>
              {suggestions.map((q) => (
                <button key={q} type="button" className="cmdk-item" onClick={() => void ask(q)}>
                  <span className="ico">{SEARCH_ICO}</span>
                  {q}
                  <span className="arr">{SARR}</span>
                </button>
              ))}
            </>
          ) : null}
        </div>

        <div className="cmdk-foot">
          <span>Answers use current listings and approved company information</span>
          <span className="mono">Consult America AI</span>
        </div>
      </div>
    </div>
    <ExpertForm open={expertOpen} onClose={() => setExpertOpen(false)} />
    </>
  );
}

function AnswerBlock({ reply, onNavigate, onTalkToExpert }: { reply: Reply; onNavigate: () => void; onTalkToExpert: () => void }) {
  const jobs = reply.jobs ?? [];
  const links = reply.links ?? [];
  const grounding = (reply.grounding ?? []).map((g) => GROUNDING_LABEL[g]).filter(Boolean);
  return (
    <div className="cmdk-answer">
      <p className="cmdk-reply">{reply.reply}</p>
      {jobs.length ? (
        <ul className="cmdk-jobs">
          {jobs.map((job) => (
            <li key={job.slug} className="cmdk-job">
              <div className="cmdk-job-main">
                <strong>{job.title}</strong>
                <span>{[job.location, job.workplaceType, job.employmentType].filter(Boolean).join(" · ")}</span>
              </div>
              <div className="cmdk-job-actions">
                <Link href={job.viewHref} onClick={onNavigate}>
                  View job
                </Link>
                {job.applyIsExternal ? (
                  <a href={job.applyHref} target="_blank" rel="noopener noreferrer">
                    Apply ↗
                  </a>
                ) : (
                  <Link href={job.applyHref} onClick={onNavigate}>
                    Apply
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {links.length ? (
        <div className="cmdk-links">
          {links.map((link) =>
            link.action === "talk_to_expert" ? (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault();
                  onTalkToExpert();
                }}
              >
                {link.label} →
              </a>
            ) : (
              <Link key={link.href} href={link.href} onClick={onNavigate}>
                {link.label} →
              </Link>
            ),
          )}
        </div>
      ) : null}
      {grounding.length ? <p className="cmdk-grounding">Based on {grounding.join(" and ")}.</p> : null}
    </div>
  );
}
