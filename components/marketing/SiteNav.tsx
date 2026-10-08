"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { CAREERS_NAV, PRIMARY_NAV, isActivePath, navHref } from "@/components/marketing/nav-config";

const CHEV = (
  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/** Delay before a mouse-hover-opened panel closes, so the pointer can cross the gap. */
const HOVER_CLOSE_MS = 160;

/**
 * Desktop Careers menu: a disclosure button that reveals two links (the
 * WAI-ARIA "disclosure navigation" pattern — these are page links, so not
 * role="menu"). Opens on click/tap, Enter/Space, ArrowDown, or mouse hover;
 * closes on Escape (focus returns to the button), outside click, focus
 * leaving the menu, or navigation. Only a hover-opened panel closes when the
 * pointer leaves.
 */
export function CareersNavMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  /** Hover-opened panels close when the pointer leaves; click/keyboard-opened ones stay open. */
  const openedBy = useRef<"hover" | "click" | "keyboard">("click");
  const panelId = useId();
  const active = CAREERS_NAV.items.some((item) => isActivePath(pathname, item.href));

  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    // Escape must also close a hover-opened panel, when focus is elsewhere on the page.
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || rootRef.current?.contains(document.activeElement)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => () => cancelClose(), []);

  const links = () => Array.from(rootRef.current?.querySelectorAll<HTMLAnchorElement>(".nav-dd a") ?? []);

  const focusLink = (index: number) => {
    const items = links();
    if (items.length === 0) return;
    items[(index + items.length) % items.length]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close(true);
      return;
    }
    const items = links();
    const current = items.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openedBy.current = "keyboard";
        setOpen(true);
      }
      // The panel is visibility:hidden until the state flips; focus next frame.
      requestAnimationFrame(() => focusLink(current + 1));
    } else if (event.key === "ArrowUp" && open) {
      event.preventDefault();
      focusLink(current <= 0 ? items.length - 1 : current - 1);
    } else if (event.key === "Home" && current >= 0) {
      event.preventDefault();
      focusLink(0);
    } else if (event.key === "End" && current >= 0) {
      event.preventDefault();
      focusLink(items.length - 1);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`nav-item has-dd${open ? " is-open" : ""}`}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        cancelClose();
        if (!open) {
          openedBy.current = "hover";
          setOpen(true);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse" || openedBy.current !== "hover") return;
        cancelClose();
        closeTimer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`nav-dd-trigger${active ? " is-active" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          cancelClose();
          // A click on a hover-opened panel pins it open instead of toggling it shut.
          if (open && openedBy.current === "hover") {
            openedBy.current = "click";
            return;
          }
          openedBy.current = "click";
          setOpen(!open);
        }}
      >
        {CAREERS_NAV.label} {CHEV}
      </button>
      <div id={panelId} className="nav-dd">
        <ul>
          {CAREERS_NAV.items.map((item) => {
            const current = isActivePath(pathname, item.href);
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={current ? "page" : undefined} onClick={() => setOpen(false)}>
                  <span className="nav-dd-t">{item.label}</span>
                  <span className="nav-dd-d">{item.description}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Mobile menu links. Careers is a labelled group with both destinations
 * always visible — no nested accordion to collide with the outer menu.
 */
export function MobileNavLinks({ onHome, onNavigate }: { onHome: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const groupId = useId();
  return (
    <>
      {PRIMARY_NAV.map((item) => (
        <Link key={item.label} href={navHref(item, onHome)} onClick={onNavigate}>
          {item.label}
        </Link>
      ))}
      <div className="mm-group" role="group" aria-labelledby={groupId}>
        <span className="mm-group-label" id={groupId}>
          {CAREERS_NAV.label}
        </span>
        {CAREERS_NAV.items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="mm-sub"
            aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </>
  );
}

/** Escape closes the mobile menu and returns focus to its toggle. */
export function useMobileMenuEscape(open: boolean, setOpen: (open: boolean) => void, toggleId: string) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      document.getElementById(toggleId)?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen, toggleId]);
}
