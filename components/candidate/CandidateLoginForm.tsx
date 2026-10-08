"use client";

import { useActionState } from "react";

import { candidateLogin, type CandidateLoginState } from "@/app/actions/candidate-portal";

const INITIAL: CandidateLoginState = { error: null };

export function CandidateLoginForm({ returnTo, demo }: { returnTo: string | null; demo: boolean }) {
  const [state, action, pending] = useActionState(candidateLogin, INITIAL);

  return (
    <form action={action} className="apply-panel cp-login-panel" noValidate>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {demo ? (
        <fieldset className="cp-demo-pick">
          <legend>Local demo — choose a candidate</legend>
          <label>
            <input type="radio" name="demoCandidate" value="a" defaultChecked /> Alex Demo
          </label>
          <label>
            <input type="radio" name="demoCandidate" value="b" /> Blake Demo
          </label>
          <p className="apply-trust">Supabase is not configured, so sign-in uses two local demo identities.</p>
        </fieldset>
      ) : (
        <>
          <div className="apply-field">
            <label htmlFor="cp-email">Email</label>
            <input id="cp-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="apply-field">
            <label htmlFor="cp-password">Password</label>
            <input id="cp-password" name="password" type="password" autoComplete="current-password" required />
          </div>
        </>
      )}
      {state.error ? (
        <p className="apply-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="apply-actions apply-actions-end">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
