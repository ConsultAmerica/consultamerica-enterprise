"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  archiveJobAction,
  deleteJobAction,
  publishJobAction,
  unpublishJobAction,
  type JobActionResult,
} from "@/lib/recruiting/job-actions";

export type JobRowActionsProps = {
  requisitionId: string;
  /**
   * Raw status, not a narrowed union: this list shows requisition statuses while
   * publication moves the posting through UNPUBLISHED/ARCHIVED, and both land here.
   */
  status: string;
  /** Used for the accessible action names, so screen readers get "Publish <job>". */
  title: string;
};

/** Live on the public careers site. */
const PUBLIC_STATUSES = ["PUBLISHED", "OPEN"];
/**
 * setJobStatus writes publication state onto the requisition under other names:
 * UNPUBLISHED is stored as ON_HOLD and ARCHIVED as CANCELLED (see
 * REQUISITION_STATUS_FOR in lib/recruiting/supabase-repository.ts). The list reads
 * the requisition, so both spellings have to drive the same set of actions.
 */
const UNPUBLISHED_STATUSES = ["UNPUBLISHED", "ON_HOLD"];
/** APPROVED sits between draft and live; without it an approved req has no way forward. */
const PUBLISHABLE_STATUSES = ["DRAFT", "APPROVED", ...UNPUBLISHED_STATUSES];
/** Only work that is off the site is deletable; archived jobs stay as the record. */
const DELETABLE_STATUSES = ["DRAFT", ...UNPUBLISHED_STATUSES];

/** The inline confirm un-arms itself so a half-finished delete never lingers. */
const CONFIRM_RESET_MS = 5000;

export function JobRowActions({ requisitionId, status, title }: JobRowActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleteWasBlocked, setDeleteWasBlocked] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!confirmingDelete) return;
    confirmButtonRef.current?.focus();
    const timer = setTimeout(() => setConfirmingDelete(false), CONFIRM_RESET_MS);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  const run = (
    action: (id: string) => Promise<JobActionResult>,
    options?: { isDelete?: boolean },
  ) => {
    setError(null);
    setDeleteWasBlocked(false);
    setConfirmingDelete(false);
    startTransition(async () => {
      const result = await action(requisitionId);
      if (!result.ok) {
        // Inline and persistent: a failed publish must never look like a no-op.
        setError(result.error);
        setDeleteWasBlocked(Boolean(options?.isDelete));
        return;
      }
      // The action revalidates on the server; refresh() re-renders the view we are on.
      router.refresh();
    });
  };

  // Archived (stored as CANCELLED), closed and filled jobs match nothing below,
  // which leaves them with Edit only: no way to quietly resurrect or destroy them.
  const canPublish = PUBLISHABLE_STATUSES.includes(status);
  const canUnpublish = PUBLIC_STATUSES.includes(status);
  const canArchive = PUBLIC_STATUSES.includes(status);
  const canDelete = DELETABLE_STATUSES.includes(status);

  return (
    <>
      <div className="ws-row-actions">
        {canPublish ? (
          <button
            type="button"
            className="ws-btn ws-btn-sm primary"
            disabled={pending}
            aria-label={`Publish ${title}`}
            onClick={() => run(publishJobAction)}
          >
            Publish
          </button>
        ) : null}
        {canUnpublish ? (
          <button
            type="button"
            className="ws-btn ws-btn-sm"
            disabled={pending}
            aria-label={`Unpublish ${title}`}
            onClick={() => run(unpublishJobAction)}
          >
            Unpublish
          </button>
        ) : null}
        <Link
          className="ws-btn ws-btn-sm"
          href={`/app/recruiting/jobs/${requisitionId}/edit`}
          aria-label={`Edit ${title}`}
        >
          Edit
        </Link>
        {canArchive ? (
          <button
            type="button"
            className="ws-btn ws-btn-sm"
            disabled={pending}
            aria-label={`Archive ${title}`}
            onClick={() => run(archiveJobAction)}
          >
            Archive
          </button>
        ) : null}
        {canDelete ? (
          confirmingDelete ? (
            <span
              className="ws-confirm"
              onBlur={(event) => {
                // Leaving the pair entirely cancels; moving between its two
                // buttons must not, so check where focus actually went.
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setConfirmingDelete(false);
                }
              }}
            >
              <button
                ref={confirmButtonRef}
                type="button"
                className="ws-btn ws-btn-sm danger"
                disabled={pending}
                aria-label={`Confirm delete of ${title}`}
                onClick={() => run(deleteJobAction, { isDelete: true })}
              >
                Confirm delete
              </button>
              <button
                type="button"
                className="ws-btn ws-btn-sm"
                disabled={pending}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="ws-btn ws-btn-sm danger"
              disabled={pending}
              aria-label={`Delete ${title}`}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          )
        ) : null}
      </div>
      {error ? (
        <p className="ws-row-error" role="alert">
          {error}
          {deleteWasBlocked ? (
            <>
              {" "}
              Archiving keeps the job and its candidate records, and removes it from the
              careers site.
              <button
                type="button"
                className="ws-btn ws-btn-sm"
                disabled={pending}
                aria-label={`Archive ${title} instead of deleting it`}
                onClick={() => run(archiveJobAction)}
              >
                Archive instead
              </button>
            </>
          ) : null}
        </p>
      ) : null}
    </>
  );
}
