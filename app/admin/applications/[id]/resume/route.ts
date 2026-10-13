import { NextResponse } from "next/server";

import { blobStorageConfigured } from "@/lib/storage/blob-token";
import { issueSignedToken, presignUrl } from "@vercel/blob";

import { type AdminSessionUser, getSessionUser } from "@/lib/neon/auth";
import { getApplicationById } from "@/lib/neon/applications";
import type { ApplicationRow } from "@/lib/neon/types";
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

/**
 * Whether this member of staff may open this particular résumé.
 *
 * A signed-in session used to be the whole test, which meant any account —
 * including the lowest-privilege RECRUITER — could read every CV in the
 * system by walking application ids. A résumé is the most personal document a
 * candidate gives us, so "is anyone logged in" is not a sufficient question.
 *
 * OWNER and ADMIN see everything: they are the accounts responsible for the
 * whole desk, and a hiring manager who cannot open a CV cannot do the job.
 *
 * A RECRUITER sees their own assignments, and anything not yet assigned to
 * anybody. The second half is deliberate and is not a loophole: unassigned
 * applications are the shared inbound queue, and a recruiter who cannot read
 * the queue cannot pick work out of it. The restriction bites exactly where it
 * should, the moment an application belongs to a named colleague.
 *
 * Returning a boolean rather than throwing keeps the decision testable and
 * keeps the route's response shape in one place. Exported for that reason:
 * tests/unit/resume-authorization.test.ts pins every branch, because a rule
 * about who may read someone's CV should fail a test before it fails a person.
 */
export function mayOpenResume(user: AdminSessionUser, application: ApplicationRow): boolean {
  if (user.role === "OWNER" || user.role === "ADMIN") return true;
  return application.assigned_recruiter_id === null || application.assigned_recruiter_id === user.id;
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

  /*
    Authorization, after the row is loaded because the decision depends on who
    the application is assigned to.

    403 and not 404. Hiding the existence of the record would be the stricter
    choice, and it is the wrong one here: everyone with an account already
    works the same queue and can see the application itself in the list, so
    pretending it does not exist would only confuse a colleague who has every
    right to ask their lead to reassign it.

    The refusal is logged. An attempt to read a CV outside your own assignments
    is the kind of thing a company needs a record of, and a silent 403 leaves
    nothing to look at afterwards.
  */
  if (!mayOpenResume(user, application)) {
    logServerError(
      "admin/resume-forbidden",
      new Error(
        `Resume access refused: ${user.role} ${user.id} requested application ${id}, assigned to ${application.assigned_recruiter_id}.`,
      ),
    );
    return NextResponse.json(
      { error: "This application is assigned to another recruiter." },
      { status: 403 },
    );
  }

  if (!application.resume_url) {
    return NextResponse.json({ error: "No resume was uploaded with this application." }, { status: 404 });
  }

  // Without a token there is nothing to sign against, which is the local-dev
  // case. Say so plainly rather than redirecting to a URL that will 403.
  if (!blobStorageConfigured()) {
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
