"use client";

import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";

import { ExpertForm } from "@/components/marketing/ExpertForm";

/**
 * "Talk to an expert" that opens the enquiry form in place, rather than
 * sending the visitor to the homepage's #contact section and losing the page
 * they were reading. Same form, and the same /api/contact route, as the header
 * button. The page path goes with the enquiry so the team can see which
 * industry page the lead came from.
 */
export function ExpertCta({ label = "Talk to an expert" }: { label?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Stable: ExpertForm's open effect depends on onClose, and a new function on
  // every render would re-run it and pull focus back to the first field.
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        {label}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
      <ExpertForm open={open} onClose={close} sourcePath={pathname ?? undefined} />
    </>
  );
}
