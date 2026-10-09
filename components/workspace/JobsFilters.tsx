"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type JobsStatusOption = { value: string; label: string };

export type JobsFiltersProps = {
  /** Owned by the page so the select and the server-side filter can never drift apart. */
  options: JobsStatusOption[];
  matchCount: number;
  totalCount: number;
};

/** Long enough to swallow a burst of typing, short enough to feel live. */
const DEBOUNCE_MS = 250;

/**
 * Both filters live in the URL (?q= / ?status=) rather than in component state:
 * the page stays a server component that does the filtering, and a filtered view
 * survives a refresh and can be pasted to a colleague.
 */
function buildHref(
  pathname: string,
  currentQueryString: string,
  next: { q?: string; status?: string },
): string {
  const params = new URLSearchParams(currentQueryString);
  if (next.q !== undefined) {
    const value = next.q.trim();
    if (value) params.set("q", value);
    else params.delete("q");
  }
  if (next.status !== undefined) {
    // "all" is the default, so it is expressed by the absence of the param.
    if (next.status && next.status !== "all") params.set("status", next.status);
    else params.delete("status");
  }
  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function JobsFilters({ options, matchCount, totalCount }: JobsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const urlQuery = searchParams.get("q") ?? "";
  const urlStatus = searchParams.get("status") ?? "all";

  const [text, setText] = useState(urlQuery);
  // What we last wrote to the URL. Lets an external navigation (Clear filters,
  // Back button) reclaim the input without a round trip stealing live typing.
  const pushedRef = useRef(urlQuery);

  useEffect(() => {
    if (urlQuery !== pushedRef.current) {
      pushedRef.current = urlQuery;
      setText(urlQuery);
    }
  }, [urlQuery]);

  useEffect(() => {
    if (text.trim() === pushedRef.current) return;
    const timer = setTimeout(() => {
      pushedRef.current = text.trim();
      // replace(), not push(): typing must not leave one history entry per keystroke.
      router.replace(buildHref(pathname, queryString, { q: text }), { scroll: false });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, pathname, queryString, router]);

  const commitNow = () => {
    pushedRef.current = text.trim();
    router.replace(buildHref(pathname, queryString, { q: text }), { scroll: false });
  };

  return (
    <form
      className="ws-toolbar"
      role="search"
      onSubmit={(event) => {
        // Enter should not reload the page; it just flushes the pending debounce.
        event.preventDefault();
        commitNow();
      }}
    >
      <div className="ws-toolbar-field">
        <label htmlFor="jobs-search">Search</label>
        <input
          id="jobs-search"
          name="q"
          type="search"
          autoComplete="off"
          placeholder="Title, requisition number or department"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="ws-toolbar-field">
        <label htmlFor="jobs-status">Status</label>
        <select
          id="jobs-status"
          name="status"
          value={urlStatus}
          onChange={(event) => {
            // push(), not replace(): a deliberate filter change is worth a Back step.
            router.push(buildHref(pathname, queryString, { status: event.target.value }), {
              scroll: false,
            });
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <p className="ws-toolbar-count" aria-live="polite">
        {matchCount === totalCount
          ? `${totalCount} requisition${totalCount === 1 ? "" : "s"}`
          : `${matchCount} of ${totalCount} requisitions`}
      </p>
    </form>
  );
}
