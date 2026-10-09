"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

import {
  assignRecruiterAction,
  setStageAction,
  type CrmActionResult,
} from "@/app/admin/applications/actions";

/**
 * The two single-field mutations on an application: which stage it is in, and
 * which recruiter owns it. They share a file because they share everything that
 * matters — one call, one pending state, one inline error, one refresh — and
 * splitting them would duplicate that three times over.
 *
 * Client components because both report a typed failure inline. A plain
 * <form action={...}> cannot read what a server action returned, so a refused
 * stage change would look exactly like a successful one.
 *
 * NOTHING HERE DECIDES WHAT IS LEGAL. The buttons offer every stage, including
 * ones behind the current position, because a recruiter who clicks INTERVIEW by
 * mistake needs a way back and the audit trail records both moves. The server
 * action re-validates the value regardless; this component is a convenience,
 * not the gate.
 */

/**
 * The forward pipeline, in order. REJECTED and WITHDRAWN are deliberately not
 * in it: they are not a seventh and eighth step, they are exits available from
 * anywhere, and rendering them in the rail would imply every application passes
 * through them.
 */
const PIPELINE = [
  "NEW",
  "SCREENING",
  "INTERVIEW",
  "SHORTLISTED",
  "OFFER",
  "HIRED",
] as const;

/** Always-available terminal actions, in the order a recruiter reaches for them. */
const TERMINAL = ["REJECTED", "WITHDRAWN"] as const;

/**
 * Every status in the schema is a single word, so a label is a case change
 * rather than a lookup table. Kept as a function so the day a two-word status
 * is added there is one place to fix.
 */
function stageLabel(stage: string): string {
  return stage.charAt(0) + stage.slice(1).toLowerCase();
}

/** The inline confirm un-arms itself, so a half-finished rejection never lingers. */
const CONFIRM_RESET_MS = 5000;

export type ApplicationStageControlProps = {
  applicationId: string;
  /** Raw status from the row, not a narrowed union: it comes from the database. */
  status: string;
  /** Used for accessible action names, so a screen reader hears "Move Jane Doe to Offer". */
  candidateName: string;
};

export function ApplicationStageControl({
  applicationId,
  status,
  candidateName,
}: ApplicationStageControlProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!confirming) return;
    confirmButtonRef.current?.focus();
    const timer = setTimeout(() => setConfirming(null), CONFIRM_RESET_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const move = (next: string) => {
    setError(null);
    setConfirming(null);
    startTransition(async () => {
      const result: CrmActionResult = await setStageAction(applicationId, next);
      if (!result.ok) {
        // Persistent and inline: a refused stage change must never read as a no-op.
        setError(result.error);
        return;
      }
      // The action revalidated on the server; this re-renders the screen we are on.
      router.refresh();
    });
  };

  // -1 for a terminal status, which is exactly right: a rejected application is
  // at no point in the forward pipeline, so no step is current and every step is
  // a re-open target.
  const currentIndex = (PIPELINE as readonly string[]).indexOf(status);
  const closed = (TERMINAL as readonly string[]).includes(status);

  return (
    <>
      <ol className="ca-crm-rail" aria-label="Hiring stage">
        {PIPELINE.map((stage, index) => {
          const state =
            index === currentIndex ? "current" : index < currentIndex ? "done" : "ahead";
          const label = stageLabel(stage);
          return (
            <li key={stage} data-state={state}>
              <button
                type="button"
                className="ca-crm-step"
                data-state={state}
                // The current stage is not an action. Disabled rather than
                // hidden so the rail keeps its shape and its position reads as
                // "you are here".
                disabled={pending || state === "current"}
                aria-current={state === "current" ? "step" : undefined}
                aria-label={
                  state === "current"
                    ? `${label}: current stage`
                    : state === "done"
                      ? `Move ${candidateName} back to ${label}`
                      : `Move ${candidateName} to ${label}`
                }
                onClick={() => move(stage)}
              >
                <span className="ca-crm-step-n" aria-hidden>
                  {index + 1}
                </span>
                <span className="ca-crm-step-label">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {closed ? (
        <p className="ca-crm-closed" role="status">
          This application is closed as <strong>{stageLabel(status)}</strong>. Choosing a stage
          above re-opens it, and both moves stay on the timeline.
        </p>
      ) : null}

      <div className="ws-actions ca-crm-terminal">
        {TERMINAL.map((stage) => {
          const label = stageLabel(stage);
          if (status === stage) {
            return (
              <span key={stage} className="ws-pill red" aria-current="step">
                {label}
              </span>
            );
          }
          if (confirming === stage) {
            return (
              <span
                key={stage}
                className="ws-confirm"
                onBlur={(event) => {
                  // Leaving the pair cancels; moving between its two buttons
                  // must not, so check where focus actually went.
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setConfirming(null);
                  }
                }}
              >
                <button
                  ref={confirmButtonRef}
                  type="button"
                  className="ws-btn ws-btn-sm danger"
                  disabled={pending}
                  aria-label={`Confirm marking ${candidateName} as ${label}`}
                  onClick={() => move(stage)}
                >
                  Confirm {label.toLowerCase()}
                </button>
                <button
                  type="button"
                  className="ws-btn ws-btn-sm"
                  disabled={pending}
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </button>
              </span>
            );
          }
          return (
            <button
              key={stage}
              type="button"
              className="ws-btn ws-btn-sm danger"
              disabled={pending}
              aria-label={`Mark ${candidateName} as ${label}`}
              onClick={() => setConfirming(stage)}
            >
              {label === "Rejected" ? "Reject" : "Withdraw"}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="ws-row-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

export type RecruiterOption = {
  id: string;
  name: string;
  /** Deactivated accounts are shown only when one is already the assignee. */
  isActive: boolean;
};

export type ApplicationRecruiterSelectProps = {
  applicationId: string;
  assignedRecruiterId: string | null;
  recruiters: RecruiterOption[];
};

/**
 * Owner dropdown. Submits on change rather than behind a Save button: there is
 * one field, and an unsaved select is a worse failure mode than an immediate
 * write that is recorded on the timeline either way.
 */
export function ApplicationRecruiterSelect({
  applicationId,
  assignedRecruiterId,
  recruiters,
}: ApplicationRecruiterSelectProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /**
   * useOptimistic, not useState: the select has to show the recruiter's choice
   * the instant they make it, but the server value is the truth. React holds
   * the optimistic value only for the length of the transition and then falls
   * back to the prop, which means a refused assignment reverts the dropdown by
   * itself — no manual rollback to get wrong, and no effect mirroring a prop
   * into state (which would also re-render the panel on every refresh).
   */
  const [value, showAssigned] = useOptimistic(assignedRecruiterId ?? "");

  const assign = (next: string) => {
    setError(null);
    startTransition(async () => {
      showAssigned(next);
      // "" is the unassign option; the action takes null for it.
      const result = await assignRecruiterAction(applicationId, next === "" ? null : next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <div className="ws-toolbar-field ca-crm-assign">
        <label htmlFor="assigned-recruiter">Assigned recruiter</label>
        <select
          id="assigned-recruiter"
          value={value}
          disabled={pending}
          onChange={(event) => assign(event.target.value)}
        >
          <option value="">Unassigned</option>
          {recruiters.map((recruiter) => (
            <option key={recruiter.id} value={recruiter.id}>
              {recruiter.isActive ? recruiter.name : `${recruiter.name} (deactivated)`}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="ws-row-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
