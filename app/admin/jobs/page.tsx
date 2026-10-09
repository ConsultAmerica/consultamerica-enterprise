/**
 * URL ALIAS ONLY — this is not the admin jobs list.
 *
 * /admin/jobs is a requested URL shape. The real jobs & requisitions list lives
 * at /app/recruiting/jobs (app/app/recruiting/jobs/page.tsx), behind Supabase
 * auth. Keep this file a redirect: new admin functionality belongs under
 * app/app/recruiting/, never here. See app/admin/README.md.
 *
 * No auth check here on purpose — app/app/layout.tsx (requireRecruitingStaff)
 * and proxy.ts already gate the destination. A second check here would just be
 * a second place to get it wrong.
 *
 * permanentRedirect (308): /app/recruiting/jobs is a canonical workspace route.
 *
 * Query strings are forwarded, so /admin/jobs?q=foo lands on
 * /app/recruiting/jobs?q=foo.
 */
import { permanentRedirect } from "next/navigation";

const DESTINATION = "/app/recruiting/jobs";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminJobsAlias({ searchParams }: Props) {
  const query = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([key, value]): [string, string][] =>
      value === undefined ? [] : Array.isArray(value) ? value.map((v) => [key, v]) : [[key, value]],
    ),
  ).toString();
  permanentRedirect(query ? `${DESTINATION}?${query}` : DESTINATION);
}
