import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseServerAuthClient } from "@/app/lib/supabase/auth-server";
import { CANDIDATE_RETURN_PREFIXES, sanitizeReturnTo } from "@/lib/auth/return-to";
import { classifyVerifyError, isConfirmLinkType } from "@/lib/candidate-portal/activation";

/**
 * Landing point for Supabase Auth email links (invitation, sign-in link,
 * password recovery). The single-use token is verified server-side by
 * Supabase Auth, which sets the session cookie; nothing here trusts the email
 * address. Supports the token-hash template link
 *   /auth/confirm?token_hash=…&type=invite&next=/candidate/activate
 * and the PKCE `?code=` form. `next` is limited to candidate pages (no open
 * redirects). Expired / reused / invalid links go to the activation page,
 * which offers a fresh link.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = sanitizeReturnTo(url.searchParams.get("next"), CANDIDATE_RETURN_PREFIXES) ?? "/candidate/activate";
  const fail = (reason: "expired" | "invalid") => {
    const target = new URL("/candidate/activate", url.origin);
    target.searchParams.set("error", reason);
    return NextResponse.redirect(target, { status: 303, headers: { "Cache-Control": "no-store" } });
  };

  const supabase = await getSupabaseServerAuthClient();
  if (!supabase) return fail("invalid");

  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const code = url.searchParams.get("code");

  if (tokenHash && isConfirmLinkType(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return fail(classifyVerifyError(error));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(classifyVerifyError(error));
  } else {
    return fail("invalid");
  }

  return NextResponse.redirect(new URL(next, url.origin), { status: 303, headers: { "Cache-Control": "no-store" } });
}
