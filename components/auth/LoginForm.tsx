"use client";

import { useActionState } from "react";

import { login, type LoginState } from "@/app/actions/auth";

export function LoginForm({ returnTo, initialError }: { returnTo: string | null; initialError: string | null }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: initialError });
  return (
    <form action={action} className="login-form" noValidate>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <div className="apply-field">
        <label htmlFor="login-email">Email</label>
        <input id="login-email" type="email" name="email" autoComplete="email" required />
      </div>
      <div className="apply-field">
        <label htmlFor="login-password">Password</label>
        <input id="login-password" type="password" name="password" autoComplete="current-password" required />
      </div>
      {state.error ? (
        <p className="apply-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
