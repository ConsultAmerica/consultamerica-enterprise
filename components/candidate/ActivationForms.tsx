"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import {
  activateCandidateAccount,
  requestCandidateAccessLink,
  type AccessRequestState,
  type ActivationFormState,
} from "@/app/actions/candidate-activation";

export function SetPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ActivationFormState, FormData>(activateCandidateAccount, { error: null });
  return (
    <form action={action} className="apply-panel cp-login-panel" noValidate>
      <div className="apply-field">
        <label htmlFor="act-email">Email</label>
        <input id="act-email" value={email} readOnly autoComplete="username" />
      </div>
      <div className="apply-field">
        <label htmlFor="act-password">New password</label>
        <input id="act-password" name="password" type="password" autoComplete="new-password" minLength={10} required aria-describedby="act-rules" />
        <p id="act-rules" className="ws-muted">At least 10 characters, with letters and a number or symbol.</p>
      </div>
      <div className="apply-field">
        <label htmlFor="act-confirm">Confirm password</label>
        <input id="act-confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {state.error ? (
        <p className="apply-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="apply-actions apply-actions-end">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Activating…" : "Activate account"}
        </button>
      </div>
    </form>
  );
}

export function AccessRequestForm() {
  const [state, action, pending] = useActionState<AccessRequestState, FormData>(requestCandidateAccessLink, { message: null, error: null });
  return (
    <form action={action} className="apply-panel cp-login-panel" noValidate>
      <div className="apply-field">
        <label htmlFor="access-email">Email you applied with</label>
        <input id="access-email" name="email" type="email" autoComplete="email" required />
      </div>
      {state.error ? (
        <p className="apply-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="cp-msg" role="status">
          {state.message}
        </p>
      ) : null}
      <div className="apply-actions apply-actions-end">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Email me a link"}
        </button>
      </div>
    </form>
  );
}

/**
 * Fallback for Supabase's default email template, which returns tokens in the
 * URL fragment (never sent to the server). Hands them to the cookie-based
 * client once, removes them from the address bar, and re-renders.
 */
export function HashSessionBridge({ supabaseUrl, anonKey }: { supabaseUrl: string; anonKey: string }) {
  const router = useRouter();
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("error_code")) {
      const reason = hash.get("error_code") === "otp_expired" ? "expired" : "invalid";
      window.history.replaceState(null, "", window.location.pathname);
      router.replace(`/candidate/activate?error=${reason}`);
      return;
    }
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (!accessToken || !refreshToken) return;
    window.history.replaceState(null, "", window.location.pathname);
    const client = createBrowserClient(supabaseUrl, anonKey);
    void client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
      router.replace(error ? "/candidate/activate?error=invalid" : "/candidate/activate");
      router.refresh();
    });
  }, [router, supabaseUrl, anonKey]);
  return null;
}
