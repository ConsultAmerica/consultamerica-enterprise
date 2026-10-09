# app/admin — URL aliases, not an admin app

Everything in this directory is a one-line redirect. The real recruiting
workspace already exists at `/app/recruiting` (`app/app/recruiting/`), with
Supabase auth (`lib/auth/recruiting.ts` → `requireRecruitingStaff`, enforced in
`app/app/layout.tsx` and refreshed by `proxy.ts`) and ~34 tables behind it.
These files exist only because the `/admin/*` URL shape was requested; building
a second dashboard here would mean two places to keep in sync and two places to
get authorization wrong, so the aliases deliberately contain no auth checks,
no data access and no UI. Query strings are forwarded to the destination.
**New admin functionality belongs under `app/app/recruiting/`, not here** — the
only reason to touch this directory is to add or retire an alias.

| Alias                 | Destination                     | Status                                                 |
| --------------------- | ------------------------------- | ------------------------------------------------------ |
| `/admin`              | `/app/recruiting`               | 308 permanent                                           |
| `/admin/dashboard`    | `/app/recruiting`               | 308 permanent                                           |
| `/admin/login`        | `/login`                        | 308 permanent                                           |
| `/admin/jobs`         | `/app/recruiting/jobs`          | 308 permanent                                           |
| `/admin/jobs/new`     | `/app/recruiting/jobs/new`      | 307 temporary — destination still being built           |
| `/admin/candidates`   | `/app/recruiting/candidates`    | 308 permanent                                           |
| `/admin/applications` | `/app/recruiting/applications`  | 308 permanent                                           |
