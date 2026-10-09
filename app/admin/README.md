# app/admin — the Neon recruitment admin

This directory was a set of one-line redirects into `/app/recruiting`. It is now
a real admin area, backed by Neon Postgres (`db/neon/001_init.sql`,
`db/neon/002_fixes.sql`, data layer in `lib/neon/`), with its own user table
(`admin_users`), its own session cookie (`ca_admin_session`) and its own guard
(`requireAdmin()` / `requireRole()` in `lib/neon/auth.ts`).

**The old Supabase workspace is untouched.** It still lives at `/app/recruiting`
(`app/app/recruiting/`) behind `requireRecruitingStaff`, still refreshed by
`proxy.ts`, still reading its own ~34 tables through `lib/recruiting/`. Nothing
here imports from `lib/recruiting/`, `lib/auth/` or `db/schema/`, and nothing
there knows this directory exists — neither system's session can grant access to
the other's pages, which is the point.

Why the aliases went: `/admin/dashboard` answered with a **308** to
`/app/recruiting`, so a successful admin sign-in (which lands on
`DEFAULT_ADMIN_LANDING`, i.e. `/admin/dashboard`) threw the browser into the
Supabase workspace, whose guard has never heard of `ca_admin_session` and
bounced it to `/login`. Sign-in worked and still looked broken.

> Browsers that visited `/admin`, `/admin/dashboard` or `/admin/login` while
> those were permanent redirects keep the hop in cache and will keep sending
> themselves to the old destination until the entry expires. A hard reload or a
> fresh profile clears it. That is why the remaining redirect in this directory
> (`/admin` → `/admin/dashboard`) is a temporary 307.

## Routes

| Route                      | What it is                                              | Auth                                      |
| -------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| `/admin`                   | 307 to `/admin/dashboard`, query string forwarded        | none (destination guards)                 |
| `/admin/dashboard`         | Overview: job, application and candidate counts          | `requireAdmin()` in the page              |
| `/admin/login`             | Sign-in, posts to a server action                        | **public**                                |
| `/admin/forgot-password`   | Request a reset link                                     | **public**                                |
| `/admin/reset-password`    | Choose a new password (`?token=`, or a forced change)    | **public** / own `getSessionUser()` check |
| `/admin/logout`            | Route handler, **POST only**, clears cookie and session  | own Origin check                          |
| `/admin/jobs`              | Jobs list                                                | guarded in the page                       |
| `/admin/jobs/new`          | Create a job                                             | guarded in the page                       |
| `/admin/applications`      | Applications queue, detail at `/admin/applications/{id}` | guarded in the page                       |
| `/admin/candidates`        | Candidate list                                           | guarded in the page                       |

## Where the guard lives, and why not in the layout

`app/admin/layout.tsx` does **not** call `requireAdmin()`. A layout wraps every
route in its segment, including the three that have to work while signed out —
`/admin/login`, `/admin/forgot-password`, `/admin/reset-password` — so a guard
there would redirect an anonymous visitor from the login page to the login page
and nobody could ever sign in.

A route group (`app/admin/(workspace)/`) is the usual fix and was rejected:
moving the guarded pages into a group leaves any page added at a plain path
outside both the shell and the guard, silently and while looking correct, and it
saves nothing, because each page already awaits the session to render its own
data.

So:

- **Each protected page calls `requireAdmin({ returnTo })` itself.** That is the
  authorization boundary. A new page under `/admin` is unguarded until it does
  this — there is no ambient protection to inherit.
- **The layout only decides whether to draw chrome**, keyed on
  `getSessionUser()` rather than on the path, because a server layout cannot see
  the URL it is rendering (same limitation documented on `requireAdmin()` in
  `lib/neon/auth.ts`). Signed in: header, nav, identity, sign-out. Not signed
  in: `children` is returned untouched, which is what the auth pages want, since
  each renders its own `MarketingHeader` and `<main>`.
- `must_change_password` counts as not-signed-in for chrome, because
  `requireAdmin()` sends those accounts to `/admin/reset-password` and lets them
  reach nothing else.
- Sign-out is a `<form method="post">`, not a link: `/admin/logout` is POST-only
  so a third-party `<img src=".../admin/logout">` cannot sign people out.

## The page shell contract

`app/admin/layout.tsx` renders `.ws` → `.ws-bar` header → `<main className="ws-main">{children}</main>`, the same split `app/app/layout.tsx` uses for the old workspace. So:

- **A signed-in page returns a fragment** and never opens a `<main>` of its own.
  Two nested `<main>` elements give a screen reader two "main" landmarks and
  apply `.ws-main`'s max-width and padding twice.
- **A branch that can only render with no session carries its own `.ws` and
  `.ws-main`** — in practice the "database not configured" panel, since the
  layout cannot read a session in that state either and returns `children` bare.

`/admin/dashboard`, `/admin/jobs`, `/admin/jobs/new`, `/admin/jobs/{id}` and
`/admin/jobs/{id}/edit` follow this. At the time of writing
`/admin/applications`, `/admin/applications/{id}` and `/admin/candidates` still
open their own `<main className="ws-main">`, from before this layout existed;
they render, with doubled padding, and the wrapper should be dropped by whoever
owns those files.

## Database down or not configured

`lib/neon/client.ts` throws `NeonConfigError` when neither `DATABASE_URL` nor
`POSTGRES_URL` is set. `getSessionUser()` runs a query, so on such a deploy the
guard throws before any page logic runs. The layout treats that one error as
"draw no chrome" and `/admin/dashboard` renders a panel naming the variable;
every other database error is re-thrown, because auth failing closed on an
outage is deliberate. A failed data read (configured but unreachable) renders a
"could not read" panel rather than printing zeros — on a recruitment dashboard,
a fabricated zero reads as "no applicants".

## Conventions

- Server components by default; client only where interaction demands it. The
  only client component here is `components/admin/AdminNav.tsx`, which needs
  `usePathname()` to mark the current section.
- Styling reuses the workspace classes (`ws-bar`, `ws-head`, `ws-panel`,
  `ws-stats`, `ws-table`, `ws-pill`, `ws-empty`). Anything genuinely new is an
  `.adm-*` rule appended at the end of `app/globals.css`; the existing `.ws-*`
  rules are not edited, so the old workspace cannot be restyled from here.
- Every figure on screen is counted by Postgres in that request. No estimates,
  no sampling, and no counting the rows of a `LIMIT`-capped list reader.
