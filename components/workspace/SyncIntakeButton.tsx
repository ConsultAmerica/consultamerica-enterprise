"use client";

import { useState, useTransition } from "react";

import { syncIntakeNow } from "@/app/actions/job-intake";

export function SyncIntakeButton({ enabled }: { enabled: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div>
      <button
        type="button"
        className="ws-btn"
        disabled={!enabled || pending}
        title={enabled ? undefined : "Mailbox sync is not configured"}
        onClick={() =>
          start(async () => {
            const r = await syncIntakeNow();
            setResult(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
          })
        }
      >
        {pending ? "Checking mailbox…" : "Sync now"}
      </button>
      {result ? <p className={`ws-flash ${result.ok ? "ok" : "err"}`}>{result.text}</p> : null}
    </div>
  );
}
