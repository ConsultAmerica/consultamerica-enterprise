"use client";

import { useState } from "react";

import { getRecruiterDocumentUrl } from "@/app/actions/recruiter-documents";

export function ViewDocumentButton({ documentId, label = "View resume" }: { documentId: string; label?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <span>
      <button
        type="button"
        className="ws-btn"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await getRecruiterDocumentUrl(documentId);
          setPending(false);
          if (result.ok) window.open(result.url, "_blank", "noopener,noreferrer");
          else setError(result.error);
        }}
      >
        {pending ? "Opening…" : label}
      </button>
      {error ? <span className="ws-flash err"> {error}</span> : null}
    </span>
  );
}
