/**
 * Safe post-login redirect targets (ported from functional-source
 * lib/auth/return-to.ts, narrowed to this app's workspace prefix).
 * Never trust an arbitrary ?returnTo= value as an open redirect.
 */

const APPROVED_PREFIXES: readonly string[] = ["/app"];

/** Candidate sign-in may return to the portal or to a job / application page. */
export const CANDIDATE_RETURN_PREFIXES: readonly string[] = ["/candidate", "/jobs"];

export function sanitizeReturnTo(
  returnTo: string | null | undefined,
  approvedPrefixes: readonly string[] = APPROVED_PREFIXES,
): string | null {
  if (!returnTo) return null;
  let value = returnTo.trim();
  if (!value) return null;
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://") || value.includes("\\") || /\s/.test(value)) {
    return null;
  }
  const pathOnly = value.split(/[?#]/)[0] ?? "";
  if (!pathOnly.startsWith("/") || pathOnly.startsWith("//") || pathOnly.includes("..")) return null;
  const allowed = approvedPrefixes.some((prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`));
  return allowed ? pathOnly : null;
}
