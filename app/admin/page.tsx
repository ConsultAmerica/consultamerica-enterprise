/**
 * /admin — the entry point, which forwards to the overview.
 *
 * This used to be a permanent redirect to /app/recruiting, the Supabase
 * workspace. /admin is now the front door of the Neon recruitment system
 * (lib/neon/*, db/neon/001_init.sql) and has its own overview at
 * /admin/dashboard, which is also DEFAULT_ADMIN_LANDING in lib/neon/auth.ts —
 * the destination sign-in uses. The old workspace is untouched and still lives
 * at /app/recruiting.
 *
 * redirect (307), NOT permanentRedirect: the previous 308 is exactly why
 * browsers that visited /admin before this change still throw themselves at
 * /app/recruiting from cache, with no way for us to clear it. A temporary
 * redirect is re-checked every time, so if /admin ever becomes a real page — or
 * the landing route moves — nobody is stuck on a stale hop.
 *
 * No auth check here on purpose. The destination calls requireAdmin() and will
 * send an anonymous visitor to /admin/login with a returnTo; guarding here as
 * well would mean two places deciding the same thing, and the redirect would
 * have to be reproduced in both.
 *
 * Query strings are forwarded, so /admin?notice=forbidden still surfaces its
 * notice on the dashboard.
 */
import { redirect } from "next/navigation";

import { DEFAULT_ADMIN_LANDING } from "@/lib/neon/auth";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminIndex({ searchParams }: Props) {
  const query = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([key, value]): [string, string][] =>
      value === undefined ? [] : Array.isArray(value) ? value.map((v) => [key, v]) : [[key, value]],
    ),
  ).toString();
  redirect(query ? `${DEFAULT_ADMIN_LANDING}?${query}` : DEFAULT_ADMIN_LANDING);
}
