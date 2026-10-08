"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { setJobSaved } from "@/app/actions/candidate-portal";

/** Bookmark toggle for signed-in candidates; a sign-in link for everyone else. */
export function SaveJobButton({
  requisitionId,
  initiallySaved,
  signedIn,
  returnTo,
}: {
  requisitionId: string;
  initiallySaved: boolean;
  signedIn: boolean;
  returnTo: string;
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!signedIn) {
    return (
      <Link href={`/candidate/login?returnTo=${encodeURIComponent(returnTo)}`} className="cp-save-job">
        Sign in to save this job
      </Link>
    );
  }

  return (
    <span className="cp-action">
      <button
        type="button"
        className="cp-save-job"
        aria-pressed={saved}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await setJobSaved(requisitionId, !saved);
            if (result.ok) setSaved(!saved);
            else setError(result.error);
          })
        }
      >
        {saved ? "★ Saved" : "☆ Save job"}
      </button>
      {error ? (
        <span role="alert" className="cp-msg cp-msg-error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
