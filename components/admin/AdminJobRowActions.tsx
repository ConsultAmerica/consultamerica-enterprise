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
} from "@/app/admin/jobs/actions";
import type { JobStatus } from "@/lib/neon/types";

/**
 * The per-job action set, used by both the admin list and a job's own page.
 *
 * Which buttons appear is decided by status, not by hiding disabled controls:
 *
 *   DRAFT, UNPUBLISHED -> Publish, Edit, Delete
 *   PUBLISHED          -> Unpublish, Edit, Archive
 *   ARCHIVED           -> Edit only
 *
 * ARCHIVED is intentionally a one-way door from this row. Archiving is the
 * answer to "take this down but keep the applications", so letting the list
 * quietly republish or destroy an archived job would undo the one guarantee
 * archiving makes. Re-opening an archived role is a deliberate act that belongs
 * somewhere more considered than a row of small buttons.
 *
 * Delete is a two-step inline confirm. Not window.confirm: that blocks the
 * whole page on a modal the page cannot style, label or dismiss for the user,
 * and it is suppressible per-origin in several browsers — which would turn the
 * one irreversible action here into a single unguarded click.
 */

export type AdminJobRowActionsProps = {
  id: string;
  status: JobStatus;
  /** Used for the accessible action names, so a screen reader hears "Publish <job>". */
  title: string;
};

/** The inline confirm un-arms itself, so a half-finished delete never lingers
 *  armed on a screen somebody walked away from. */
const CONFIRM_RESET_MS = 5000;

export function AdminJobRowActions({ id, status, title }: AdminJobRowActionsProps) {
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
    action: (jobId: string) => Promise<JobActionResult>,
    options?: { isDelete?: boolean },
  ) => {
    setError(null);
    setDeleteWasBlocked(false);
    setConfirmingDelete(false);
    startTransition(async () => {
      const result = await action(id);
      if (!result.ok) {
        // Inline and persistent. A failed publish must never be
        // indistinguishable from a no-op.
        setError(result.error);
        setDeleteWasBlocked(Boolean(options?.isDelete));
        return;
      }
      // The action revalidated on the server; refresh() re-renders the view the
      // admin is actually looking at, list or detail.
      router.refresh();
    });
  };

  const canPublish = status === "DRAFT" || status === "UNPUBLISHED";
  const canDelete = status === "DRAFT" || status === "UNPUBLISHED";
  const canUnpublish = status === "PUBLISHED";
  const canArchive = status === "PUBLISHED";

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

        {/* Edit is available at every status, including ARCHIVED: correcting a
            typo in a record must not require putting the job back on the site. */}
        <Link className="ws-btn ws-btn-sm" href={`/admin/jobs/${id}/edit`} aria-label={`Edit ${title}`}>
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
                // Leaving the pair entirely cancels the delete; moving between
                // its own two buttons must not, so check where focus went.
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
                aria-label={`Confirm permanent delete of ${title}`}
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
          {/* Offered only in this state, never in the row above: a draft's
              normal actions are Publish / Edit / Delete, and Archive appears
              here solely because the delete was refused and archiving is the
              action the admin actually wanted. */}
          {deleteWasBlocked ? (
            <button
              type="button"
              className="ws-btn ws-btn-sm"
              disabled={pending}
              aria-label={`Archive ${title} instead of deleting it`}
              onClick={() => run(archiveJobAction)}
            >
              Archive instead
            </button>
          ) : null}
        </p>
      ) : null}
    </>
  );
}
