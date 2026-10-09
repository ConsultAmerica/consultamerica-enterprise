import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_LOGIN_PATH, SESSION_COOKIE, destroySession, sessionCookieAttributes } from "@/lib/neon/auth";
import { logServerError } from "@/lib/observability/logger";

/**
 * Admin sign-out: deletes the admin_sessions row and clears the cookie.
 *
 * Both halves matter. Clearing only the cookie would leave a usable token in
 * the database for up to seven days, so anything that captured it (a shared
 * machine, a proxy log) would still be signed in. Deleting only the row would
 * leave the browser presenting a dead cookie on every request.
 *
 * POST only, which Next enforces by answering 405 to anything else. A GET
 * sign-out can be triggered by any third-party page that embeds
 * <img src=".../admin/logout">; it is not dangerous, but being logged out at
 * random is not a feature. Sign-out is therefore a small form, not a link.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  /**
   * Origin check. Server Actions get a same-origin check from Next for free;
   * route handlers do not, so this does it by hand. A missing Origin header is
   * allowed through because some clients omit it on same-origin form posts,
   * and the worst case for sign-out is being signed out.
   */
  const origin = request.headers.get("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === request.headers.get("host");
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
    }
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await destroySession(token);
    } catch (error) {
      // A database failure must not trap someone in a signed-in state: clear
      // the cookie regardless. The row will be swept by the expiry prune in
      // createSession, or by its own expires_at.
      logServerError("admin-auth/logout", error);
    }
  }

  const response = NextResponse.redirect(new URL(`${ADMIN_LOGIN_PATH}?notice=signed-out`, request.url), {
    // 303 so the browser follows with GET. A 302 after a POST leaves older
    // clients free to re-POST to the login page.
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
  // Written onto the response rather than through cookies(), so the Set-Cookie
  // travels with the redirect itself. Same attributes as when it was set,
  // because a cookie is only replaced when name, path and domain all match.
  response.cookies.set(SESSION_COOKIE, "", sessionCookieAttributes(0));
  return response;
}
