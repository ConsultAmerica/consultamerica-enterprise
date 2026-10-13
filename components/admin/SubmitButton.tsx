"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that says it is working.
 *
 * WHY THIS EXISTS. Signing in takes roughly half a second: about 300ms of that
 * is bcrypt verifying the password at cost 12, and the rest is database round
 * trips. With a plain submit button nothing on screen changes for that whole
 * time, so the click reads as "nothing happened" and people press it again.
 *
 * THE DELAY IS NOT A BUG AND IS NOT BEING REMOVED. Slowness is the entire
 * point of bcrypt: it is what makes guessing passwords expensive. Dropping the
 * cost factor from 12 to 10 would take verification from ~300ms to ~70ms and
 * make an attacker's work four times cheaper. The honest fix is to show the
 * work, not to do less of it.
 *
 * STILL WORKS WITHOUT JAVASCRIPT. useFormStatus only adds the pending state;
 * the element remains an ordinary submit button inside an ordinary form, so a
 * browser with scripting disabled posts it exactly as before. That was a
 * deliberate property of the sign-in page and this does not take it away.
 */

type Props = {
  /** Resting label, e.g. "Sign in". */
  children: React.ReactNode;
  /** Shown while the form is in flight. Keep it a verb in progress. */
  pendingLabel: string;
  className?: string;
};

export function SubmitButton({ children, pendingLabel, className = "btn btn-primary" }: Props) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <span className="sb-spin" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
