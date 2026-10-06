/**
 * Minimal, dependency-free server-side error logging. No Sentry/observability
 * vendor is wired into this repo today — this exists so catching an error to
 * sanitize its user-facing message never means throwing away the technical
 * detail. Swap the console.error call for a real sink (Sentry, Datadog, a
 * structured log shipper) in one place when one is adopted.
 */
export function logServerError(
  context: string,
  error: unknown,
  meta?: Record<string, unknown>,
): void {
  const detail =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { value: error };

  console.error(
    JSON.stringify({
      level: "error",
      context,
      at: new Date().toISOString(),
      ...detail,
      ...meta,
    }),
  );
}
