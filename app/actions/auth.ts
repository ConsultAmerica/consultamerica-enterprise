"use server";

import { redirect } from "next/navigation";

import { getSupabaseServerAuthClient } from "@/app/lib/supabase/auth-server";
import { getSupabaseServiceClient } from "@/app/lib/supabase/server";
import { isRecruitingStaff } from "@/lib/auth/recruiting";
import { sanitizeReturnTo } from "@/lib/auth/return-to";

export type LoginState = { error: string | null };

/**
 * Staff sign-in (ported from functional-source app/actions/auth.ts `login`).
 * Same Supabase Auth + profiles/user_roles model. This app currently hosts
 * only the recruiting workspace, so non-recruiting accounts are signed back
 * out with a clear message instead of landing on a page they cannot use.
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  const password = formData.get("password") as string | null;
  if (!email || !password) return { error: "Please enter your email and password." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email address." };

  const supabase = await getSupabaseServerAuthClient();
  if (!supabase) return { error: "Authentication is not configured. Please contact support." };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("invalid login") || message.includes("invalid credentials")) {
      return { error: "We couldn't sign you in with those credentials. Check your email and password and try again." };
    }
    if (message.includes("email not confirmed")) {
      return { error: "Your email has not been confirmed. Please check your inbox for the confirmation link." };
    }
    console.error("[auth] sign-in failed", { code: error.code ?? null });
    return { error: "Unable to sign in. Please try again." };
  }
  if (!data.user) return { error: "Unable to sign in. Please try again." };

  const service = getSupabaseServiceClient();
  const { data: profile } = service
    ? await service.from("profiles").select("id").eq("auth_user_id", data.user.id).maybeSingle()
    : { data: null };
  const { data: roleRows } =
    service && profile ? await service.from("user_roles").select("role").eq("user_id", profile.id) : { data: [] };
  const roles = (roleRows ?? []).map((r) => r.role as string);

  if (!isRecruitingStaff(roles)) {
    await supabase.auth.signOut();
    return { error: "This sign-in is for Consult America recruiting staff. Your account does not have recruiting access." };
  }

  redirect(sanitizeReturnTo(formData.get("returnTo") as string | null) ?? "/app/recruiting");
}

export async function logout() {
  const supabase = await getSupabaseServerAuthClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
