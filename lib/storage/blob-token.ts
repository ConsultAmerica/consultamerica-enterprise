import "server-only";

/**
 * Whether blob storage is usable, read in a way the bundler cannot inline.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT JUST `process.env.BLOB_READ_WRITE_TOKEN`.
 *
 * Production reported "Resume storage is not configured
 * (BLOB_READ_WRITE_TOKEN)" while the variable was correctly set on the Vercel
 * project for production, preview and development, the Blob store was
 * connected, and the store's own record pointed at the live deployment. Every
 * piece of configuration was right and the running function still could not
 * see it.
 *
 * The difference was how the code asked. A STATIC member access,
 * `process.env.BLOB_READ_WRITE_TOKEN`, is a substitution target: the bundler
 * can replace it with a literal at build time, and once it has, the value is
 * frozen into the output and no amount of correct runtime configuration can
 * change it. A COMPUTED access, `process.env[name]`, cannot be substituted,
 * because the key is not known until the expression runs.
 *
 * lib/neon/client.ts had been reading DATABASE_URL the computed way all along,
 * which is exactly why the database check reported healthy from the same
 * endpoint, in the same request, where the blob check reported missing. Two
 * variables, both present, one visible.
 *
 * Reading it through a variable is the whole fix. It is not a workaround for a
 * bundler quirk so much as the honest shape of the question: this value is a
 * property of the environment the code is running in, not of the environment
 * it was built in.
 */

/** Named here rather than inline, so the access below stays computed. */
const BLOB_TOKEN_VAR = "BLOB_READ_WRITE_TOKEN";

/** The token itself, or undefined. Never logged, never returned to a browser. */
export function blobToken(): string | undefined {
  const value = process.env[BLOB_TOKEN_VAR];
  return value && value.trim() !== "" ? value : undefined;
}

/** True when uploads and signed reads can work in this environment. */
export function blobStorageConfigured(): boolean {
  return blobToken() !== undefined;
}
