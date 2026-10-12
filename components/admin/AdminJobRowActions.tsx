"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";

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
 * A SINGLE MENU, NOT A ROW OF BUTTONS. This used to render Publish, Edit,
 * Archive and Delete inline on every row. Four controls times twenty rows is
 * eighty buttons competing with the data for attention, the column width
 * changed with the job's status, and a red Delete sat one mis-click from a
 * blue Publish. One ⋯ button per row keeps the table scannable and puts the
 * destructive action behind a deliberate second step of its own.
 *
 * Which items appear is still decided by status, not by showing disabled ones:
 *
 *   DRAFT, UNPUBLISHED -> Publish, Edit, Delete
 *   PUBLISHED          -> Unpublish, Edit, Archive
 *   ARCHIVED           -> Edit only
 *
 * ARCHIVED is intentionally a one-way door from this row. Archiving is the
 * answer to "take this down but keep the applications", so letting the list
 * quietly republish or destroy an archived job would undo the one guarantee
 * archiving makes. Re-opening an archived role is a deliberate act that belongs
 * somewhere more considered than a row menu.
 *
 * Delete is a two-step inline confirm inside the menu. Not window.confirm:
 * that blocks the whole page on a modal the page cannot style, label or
 * dismiss for the user, and it is suppressible per-origin in several browsers,
 * which would turn the one irreversible action here into a single unguarded
 * click.
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

const DOTS = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="12" cy="19" r="1.7" />
  </svg>
);

export function AdminJobRowActions({ id, status, title }: AdminJobRowActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleteWasBlocked, setDeleteWasBlocked] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [open, setOpen] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  /** Close, and put focus back where it came from. */
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setConfirmingDelete(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  /*
    Dismissal. Three ways out, because a menu you can only close by picking
    something from it is a trap: Escape, a click anywhere else, and moving
    focus out of it with the keyboard.

    pointerdown rather than click so the menu is gone before the click lands,
    which stops a stray activation on whatever was underneath it.
  */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) close(false);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [open, close]);

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
    setOpen(false);
    startTransition(async () => {
      const result = await action(id);
      if (!result.ok) {
        // Inline and persistent, outside the menu. A failed publish must never
        // be indistinguishable from a no-op, and it must not vanish with the
        // menu that launched it.
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
      <div className="jm" ref={wrapRef}>
        <button
          ref={triggerRef}
          type="button"
          className="jm-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`Actions for ${title}`}
          disabled={pending}
          onClick={() => (open ? close(true) : setOpen(true))}
        >
          {DOTS}
        </button>

        {open ? (
          <div className="jm-menu" id={menuId} role="menu" aria-label={`Actions for ${title}`}>
            {canPublish ? (
              <button
                type="button"
                role="menuitem"
                className="jm-item"
                disabled={pending}
                onClick={() => run(publishJobAction)}
              >
                Publish
              </button>
            ) : null}

            {canUnpublish ? (
              <button
                type="button"
                role="menuitem"
                className="jm-item"
                disabled={pending}
                onClick={() => run(unpublishJobAction)}
              >
                Unpublish
              </button>
            ) : null}

            {/* Edit is available at every status, including ARCHIVED:
                correcting a typo in a record must not require putting the job
                back on the site. */}
            <Link className="jm-item" role="menuitem" href={`/admin/jobs/${id}/edit`}>
              Edit
            </Link>

            <Link className="jm-item" role="menuitem" href={`/admin/jobs/${id}`}>
              View details
            </Link>

            {canArchive ? (
              <button
                type="button"
                role="menuitem"
                className="jm-item"
                disabled={pending}
                onClick={() => run(archiveJobAction)}
              >
                Archive
              </button>
            ) : null}

            {canDelete ? (
              <>
                <span className="jm-sep" role="separator" />
                {confirmingDelete ? (
                  /*
                    The confirm replaces the Delete item in place rather than
                    opening a dialog. The menu is already a deliberate second
                    click; a third surface on top of it would be ceremony, and
                    the warning belongs where the eye already is.
                  */
                  <div className="jm-confirm">
                    <p className="jm-confirm-q">Delete this job permanently?</p>
                    <div className="jm-confirm-row">
                      <button
                        ref={confirmButtonRef}
                        type="button"
                        className="jm-item is-danger is-solid"
                        disabled={pending}
                        aria-label={`Confirm permanent delete of ${title}`}
                        onClick={() => run(deleteJobAction, { isDelete: true })}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="jm-item"
                        disabled={pending}
                        onClick={() => setConfirmingDelete(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="jm-item is-danger"
                    disabled={pending}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete
                  </button>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="ws-row-error" role="alert">
          {error}
          {/* Offered only in this state, never in the menu above: a draft's
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
