import { NextResponse, type NextRequest } from "next/server";

import { isExplicitDemoMode } from "@/app/lib/supabase/client";
import { updateSupabaseSession } from "@/app/lib/supabase/session";
import { PORTAL_PATH_HEADER } from "@/lib/candidate-portal/paths";

/**
 * Session refresh + cheap signed-in gate for the recruiting workspace (/app)
 * and the candidate portal (/candidate). Role authorization happens in each
 * area's layout and in every server action (requireRecruitingStaff /
 * requireCandidate). Ported from functional-source proxy.ts.
 * Local demo mode (non-production with Supabase unset) leaves /app open.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isWorkspace = pathname === "/app" || pathname.startsWith("/app/");
  const isCandidatePortal =
    (pathname === "/candidate" || pathname.startsWith("/candidate/")) &&
    !pathname.startsWith("/candidate/login") &&
    !pathname.startsWith("/candidate/activate");

  // Layouts can't see the URL; the portal layout uses this for its sign-in returnTo
  // (it is re-sanitized there, so a client-supplied value has no effect).
  let requestHeaders: Headers | undefined;
  if (isCandidatePortal) {
    requestHeaders = new Headers(request.headers);
    requestHeaders.set(PORTAL_PATH_HEADER, pathname);
  }

  const { response, user } = await updateSupabaseSession(request, requestHeaders);
  if (isExplicitDemoMode()) return response;

  if ((isWorkspace || isCandidatePortal) && !user) {
    const loginUrl = new URL(isWorkspace ? "/login" : "/candidate/login", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return response;
}

export const config = {
  // Detailed Apply is included so a signed-in candidate's session stays fresh
  // there; it is never gated — anonymous applicants keep full access.
  matcher: ["/app/:path*", "/login", "/candidate/:path*", "/jobs/:slug/apply/:path*"],
};
