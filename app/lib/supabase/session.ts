import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseBrowserConfigured } from "@/app/lib/supabase/client";

/**
 * Refreshes the Supabase Auth session cookie and returns the current user.
 * Called from proxy.ts. Ported from functional-source app/lib/supabase/middleware.ts.
 */
export async function updateSupabaseSession(
  request: NextRequest,
  requestHeaders?: Headers,
): Promise<{ response: NextResponse; user: User | null }> {
  const response = NextResponse.next(requestHeaders ? { request: { headers: requestHeaders } } : { request });
  if (!isSupabaseBrowserConfigured()) return { response, user: null };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { response, user };
}
