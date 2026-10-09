/**
 * URL ALIAS ONLY — this is not the admin job form.
 *
 * /admin/jobs/new is a requested URL shape. The real "create a requisition"
 * form lives at /app/recruiting/jobs/new, behind Supabase auth. Keep this file
 * a redirect: new admin functionality belongs under app/app/recruiting/, never
 * here. See app/admin/README.md.
 *
 * No auth check here on purpose — app/app/layout.tsx (requireRecruitingStaff)
 * and proxy.ts already gate the destination. A second check here would just be
 * a second place to get it wrong.
 *
 * redirect (307), NOT permanentRedirect: unlike the other aliases, the
 * destination app/app/recruiting/jobs/new/page.tsx is still being built. Until
 * it exists, /app/recruiting/jobs/new is swallowed by the sibling dynamic
 * segment [requisitionId] and notFound()s. A 308 would let browsers cache a
 * hop to a 404 indefinitely; a 307 is re-checked each time. Once the
 * destination has shipped and settled, switch this to permanentRedirect to
 * match the rest of app/admin/.
 *
 * Query strings are forwarded (e.g. a prefill ?intakeId=).
 */
import { redirect } from "next/navigation";

const DESTINATION = "/app/recruiting/jobs/new";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminNewJobAlias({ searchParams }: Props) {
  const query = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([key, value]): [string, string][] =>
      value === undefined ? [] : Array.isArray(value) ? value.map((v) => [key, v]) : [[key, value]],
    ),
  ).toString();
  redirect(query ? `${DESTINATION}?${query}` : DESTINATION);
}
