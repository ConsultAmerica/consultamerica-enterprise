"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/app/actions/candidate-portal";

/**
 * A small button that runs a server action (optionally after a confirm()),
 * then shows the result inline and refreshes the page data.
 */
export function ConfirmActionButton({
  run,
  label,
  pendingLabel,
  confirmText,
  className = "apply-text-btn",
}: {
  run: () => Promise<ActionResult>;
  label: string;
  pendingLabel?: string;
  confirmText?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <span className="cp-action">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          start(async () => {
            const result = await run();
            setMessage(result.ok ? (result.message ? { ok: true, text: result.message } : null) : { ok: false, text: result.error });
            router.refresh();
          });
        }}
      >
        {pending ? (pendingLabel ?? "Working…") : label}
      </button>
      {message ? (
        <span role={message.ok ? "status" : "alert"} className={message.ok ? "cp-msg" : "cp-msg cp-msg-error"}>
          {message.text}
        </span>
      ) : null}
    </span>
  );
}
