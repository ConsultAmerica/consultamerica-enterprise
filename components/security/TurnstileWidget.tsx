"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";

import { turnstileSiteKey } from "@/lib/security/turnstile";

/**
 * Renders a Cloudflare Turnstile challenge and carries its token in a hidden
 * field named `turnstileToken`, so any form that already serialises itself with
 * FormData picks it up with no other change.
 *
 * With no NEXT_PUBLIC_TURNSTILE_SITE_KEY configured this renders null and loads
 * no script, which is the state the site is in today: the forms it is dropped
 * into look and behave exactly as they did before.
 */

type TurnstileOptions = {
  sitekey: string;
  action?: string;
  theme?: "light" | "dark" | "auto";
  appearance?: "always" | "execute" | "interaction-only";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  "error-callback"?: () => void;
};

type TurnstileApi = {
  render: (element: HTMLElement, options: TurnstileOptions) => string | undefined;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

/**
 * The script calls this global once its API is attached. Using the documented
 * `onload=` hook rather than the script tag's own load event avoids a window
 * where `window.turnstile` is not yet defined.
 */
const READY_CALLBACK = "__caTurnstileReady";

const SCRIPT_SRC = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${READY_CALLBACK}`;

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    [READY_CALLBACK]?: () => void;
  }
}

/**
 * Module scope, so several mounted widgets share one script load and one
 * in-flight promise instead of each injecting their own tag.
 */
let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    window[READY_CALLBACK] = () => resolve();

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    // A tag already in the document means a previous mount injected it and the
    // ready callback has not fired yet; the reassignment above is enough.
    if (existing) return;

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      // Let a later mount retry rather than caching the failure forever.
      scriptPromise = null;
      reject(new Error("Turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export type TurnstileHandle = {
  /**
   * Discards the current token and asks Turnstile for a fresh one. Tokens are
   * single-use and expire after roughly five minutes, so a form MUST call this
   * once a submission has consumed one — otherwise the next submit sends a
   * spent token and is rejected with no visible cause.
   */
  reset: () => void;
};

export function TurnstileWidget({
  ref,
  action,
  className,
}: {
  ref?: React.Ref<TurnstileHandle>;
  /** Optional label shown in Cloudflare's analytics, e.g. "contact". */
  action?: string;
  className?: string;
}) {
  const siteKey = turnstileSiteKey();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState("");

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        setToken("");
        if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
      },
    }),
    [],
  );

  useEffect(() => {
    if (!siteKey) return;

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        // Guards against React's development double-invoke rendering two
        // challenges into the same container.
        if (widgetIdRef.current) return;

        widgetIdRef.current =
          window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            action,
            // The surrounding marketing pages are light-only; "auto" would
            // follow the OS and drop a dark box into a white panel.
            theme: "light",
            // Invisible unless this visitor actually has to prove something.
            appearance: "interaction-only",
            callback: (next) => setToken(next),
            "expired-callback": () => {
              setToken("");
              if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
            },
            "timeout-callback": () => setToken(""),
            // Deliberately does not return true: Turnstile then shows its own
            // retry affordance, which is better than a silently dead widget.
            "error-callback": () => setToken(""),
          }) ?? null;
      })
      .catch((error: unknown) => {
        // Usually an ad blocker or an offline visitor. Nothing useful to show
        // them here; the server returns a plain retry message if they submit.
        console.warn("[turnstile] widget unavailable", error);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, action]);

  // No key configured: contribute nothing at all, not even an empty field.
  if (!siteKey) return null;

  return (
    <div className={className}>
      <div ref={containerRef} />
      <input type="hidden" name="turnstileToken" value={token} readOnly />
    </div>
  );
}
