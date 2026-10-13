"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { generateJobInterviewsBulkAction } from "@/app/admin/jobs/actions";

/**
 * Generate AI interviews for every published job that has not got one.
 *
 * WHY THIS AND NOT CHECKBOXES IN THE TABLE. The only selection anybody would
 * ever make is "the jobs with no interview", and the database can answer that
 * exactly. Making /admin/jobs selectable would mean turning a server-rendered
 * table into a client component to hold ticked boxes that express a filter the
 * query already knows, and the count would still have to come from the server
 * to be true beyond the current page. So the eligible set is defined once in
 * listJobsNeedingConsultHire, this button shows how big it is, and the action
 * iterates the same function.
 *
 * The count is rendered on the button rather than kept behind the click,
 * because it is the thing that makes the action safe to press: a recruiter can
 * see it is about to touch four jobs and not forty.
 *
 * The press is slow by nature. Each job is an LLM call at ConsultHire and they
 * run one at a time, so this can take a minute for ten jobs. The label says so
 * while it runs, since a button that looks dead gets pressed again.
 */
export function AdminGenerateInterviews({ pending: eligible }: { pending: number }) {
  const router = useRouter();
  const [running, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const go = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await generateJobInterviewsBulkAction();
      if (!result.ok) {
        setMessage({ tone: "err", text: result.error });
        return;
      }
      // The numbers come from the server, not from the count on the button. If
      // another admin generated three of them a moment ago, the recruiter is
      // told what actually happened rather than a cheerful figure that was
      // already stale when the page rendered.
      setMessage({ tone: "ok", text: result.message });
      router.refresh();
    });
  };

  return (
    <div className="adm-bulk-gen">
      <button type="button" className="ws-btn" disabled={running} onClick={go}>
        {running
          ? "Generating AI interviews…"
          : `Generate ${eligible} AI interview${eligible === 1 ? "" : "s"}`}
      </button>
      {message ? (
        <p
          className={`adm-bulk-gen-msg ${message.tone}`}
          role={message.tone === "err" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
