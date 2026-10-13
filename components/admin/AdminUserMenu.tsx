"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * The signed-in identity, and the one action attached to it.
 *
 * NO AVATAR. An initials bubble was tried here and removed: it is the only
 * place in the admin where the mark identifies the person reading the screen
 * rather than a person in a list, and you do not need a coloured circle to
 * recognise yourself. Candidates keep theirs, where it does real work helping
 * you spot the same applicant across three rows.
 *
 * WHAT THIS REPLACED. The bar used to show a bare name, a role badge and a
 * Sign out button sitting loose beside it. Three elements of equal weight for
 * one piece of information and one rarely-used action, with the most
 * destructive thing in the header permanently one click away.
 *
 * Now it is a single control. The name identifies you, the menu holds the
 * detail you only occasionally need — which account, which email, which
 * permission level — and Sign out lives inside it where it cannot be hit by
 * accident while reaching for the nav.
 *
 * SIGN OUT IS STILL A FORM, AND THAT IS NOT NEGOTIABLE. /admin/logout is
 * POST-only: a GET sign-out can be fired by any third-party page that embeds
 * <img src=".../admin/logout">, and an <a> would make being signed out a
 * one-click cross-site trick. The handler also checks Origin. Putting it in a
 * menu changes where the button lives, never what it is.
 */

type Props = {
  fullName: string;
  email: string;
  /** Already humanised by the layout ("Owner", not "OWNER"). */
  roleLabel: string;
};

const CHEVRON = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const EXIT = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" />
  </svg>
);

/**
 * Up to two initials from a display name.
 *
 * Falls back to one character, and to nothing at all for a blank name, rather
 * than rendering a placeholder glyph: an empty circle is quieter than a "?"
 * standing in for a person who does have a name somewhere.
 */
function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AdminUserMenu({ fullName, email, roleLabel }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  /*
    Three ways out, because a menu you can only close by picking something from
    it is a trap: Escape, a click anywhere else, and moving focus out with the
    keyboard. pointerdown rather than click so the menu is gone before the
    click lands, which stops a stray activation underneath it.
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

  return (
    <div className="nv-user" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="nv-user-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        {/*
          Initials, so the account has a shape and not only a name. At the foot
          of the rail this is the one row that is about the person using the
          tool rather than the work in it, and a bare text button there reads
          as something unfinished. Hidden from assistive technology because the
          name beside it already says who this is.
        */}
        <span className="nv-user-ini" aria-hidden>
          {initials(fullName)}
        </span>
        <span className="nv-user-id">
          <span className="nv-user-name">{fullName}</span>
          <span className="nv-user-role">{roleLabel}</span>
        </span>
        <span className={`nv-user-caret${open ? " is-open" : ""}`}>{CHEVRON}</span>
      </button>

      {open ? (
        <div className="nv-menu" id={menuId} role="menu" aria-label="Account">
          <div className="nv-menu-head">
            <span className="nv-menu-id">
              <span className="nv-menu-name">{fullName}</span>
              {/* The email is the account's real identity and the thing you
                  need when you have two of them open. Truncated, never
                  wrapped: a wrapped address makes the menu jump in height. */}
              <span className="nv-menu-email" title={email}>
                {email}
              </span>
            </span>
          </div>

          <div className="nv-menu-role">
            <span>Access level</span>
            <b>{roleLabel}</b>
          </div>

          <form method="post" action="/admin/logout" className="nv-menu-form">
            <button type="submit" role="menuitem" className="nv-menu-out">
              {EXIT}
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
