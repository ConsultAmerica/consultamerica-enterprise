import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cookie-aware, anon-key Supabase client for real user auth (sign in/out,
 * session reads) in Server Actions and Server Components. Ported from
 * consultamerica-functional-source app/lib/supabase/auth-server.ts.
 * Distinct from getSupabaseServiceClient() (service role, no session).
 */
export async function getSupabaseServerAuthClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component render: proxy.ts refreshes the session cookie instead.
        }
      },
    },
  });
}
