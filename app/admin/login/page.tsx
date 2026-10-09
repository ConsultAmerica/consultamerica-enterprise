/**
 * URL ALIAS ONLY — this is not a separate admin sign-in.
 *
 * /admin/login is a requested URL shape. The real staff sign-in lives at
 * /login (app/login/page.tsx). Keep this file a redirect: there must only ever
 * be one staff login page. See app/admin/README.md.
 *
 * No auth check here on purpose — /login is the auth entry point itself.
 *
 * permanentRedirect (308): /login is the canonical staff sign-in and is
 * referenced directly by lib/auth/recruiting.ts and proxy.ts, so it is not
 * expected to move.
 *
 * Query strings are forwarded so ?error= and ?returnTo= survive the hop. Note
 * that /login runs ?returnTo= through sanitizeReturnTo, which only approves the
 * /app prefix — a returnTo pointing at /admin/* is dropped and the user lands
 * on the default post-login destination. That is intentional (no open
 * redirects); translating /admin/* back to /app/recruiting/* here would put the
 * alias mapping in two places.
 */
import { permanentRedirect } from "next/navigation";

const DESTINATION = "/login";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminLoginAlias({ searchParams }: Props) {
  const query = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([key, value]): [string, string][] =>
      value === undefined ? [] : Array.isArray(value) ? value.map((v) => [key, v]) : [[key, value]],
    ),
  ).toString();
  permanentRedirect(query ? `${DESTINATION}?${query}` : DESTINATION);
}
