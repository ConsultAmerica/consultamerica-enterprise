import { NextResponse } from "next/server";
import { issueSignedToken, presignUrl } from "@vercel/blob";

import { getSessionUser } from "@/lib/neon/auth";
import { getApplicationById } from "@/lib/neon/applications";
import { logServerError } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands a signed, short-lived URL to a candidate's resume.
 *
 * Resumes are uploaded with `access: "private"`, so the stored URL is NOT
 * directly fetchable — linking to it from the dashboard returns 403. This
 * route is the "the app issues access" half that db/neon/001_init.sql refers
 * to: it checks the caller is signed-in recruiting staff, then mints a URL
 * that expires.
 *
 * Deliberately a redirect rather than a proxy. Streaming the bytes through a
 * serverless function would burn memory and execution time on every CV view,
 * and buys nothing: the signed URL is already unguessable and short-lived.
 */
const LINK_TTL_SECONDS = 300;

/**
 * The blob pathname from a stored blob URL.
 *
 * presignUrl signs a *pathname*, but applications.resume_url holds the full URL
 * that `put` returned, so the host has to come off first. uploadResume limits
 * filenames to [A-Za-z0-9._-], so in practice nothing is percent-encoded; it is
 * decoded anyway because the signature must be computed over the real pathname
 * rather than an encoded form of it.
 */
function blobPathname(blobUrl: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(blobUrl).pathname.replace(/^\/+/, "");
  } catch {
    return null;
  }
  if (!pathname) return null;
  try {
    return decodeURIComponent(pathname);
  } catch {
    // Malformed percent-encoding: sign exactly what the URL carries.
    return pathname;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // No redirect to /admin/login here. This URL is opened in a new tab from the
  // dashboard, and bouncing a new tab to a sign-in form is a confusing way to
  // say "your session expired".
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let application;
  try {
    application = await getApplicationById(id);
  } catch (error) {
    logServerError("admin/resume-download", error);
    return NextResponse.json({ error: "Could not load that application." }, { status: 503 });
  }

  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }
  if (!application.resume_url) {
    return NextResponse.json({ error: "No resume was uploaded with this application." }, { status: 404 });
  }

  // Without a token there is nothing to sign against, which is the local-dev
  // case. Say so plainly rather than redirecting to a URL that will 403.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Resume storage is not configured in this environment (BLOB_READ_WRITE_TOKEN)." },
      { status: 503 },
    );
  }

  const pathname = blobPathname(application.resume_url);
  if (!pathname) {
    logServerError(
      "admin/resume-presign",
      new Error(`applications.resume_url is not a usable blob URL (application ${id}).`),
    );
    return NextResponse.json({ error: "Could not open that resume." }, { status: 502 });
  }

  try {
    // Two steps, because that is the shape of the v2 Blob signing API: a
    // delegation token scoped to this one pathname and this one operation, then
    // a URL signed against it. Scoping the token to `get` on a single pathname
    // means a leaked delegation cannot be used to read any other résumé.
    const validUntil = Date.now() + LINK_TTL_SECONDS * 1000;
    const signedToken = await issueSignedToken({
      pathname,
      operations: ["get"],
      validUntil,
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      operation: "get",
      pathname,
      access: "private",
      validUntil,
    });
    return NextResponse.redirect(presignedUrl, {
      status: 302,
      // A signed URL must never be cached by a proxy or the browser: it is a
      // bearer credential for someone else's personal data.
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    logServerError("admin/resume-presign", error);
    return NextResponse.json({ error: "Could not open that resume." }, { status: 502 });
  }
}
