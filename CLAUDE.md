@AGENTS.md

# Infrastructure: always the Consult America organization

All Consult America development and infrastructure work uses the **company**
account. Shafay also has a personal Neon account, and the two are easy to
confuse because both are Vercel-managed and both are reachable from the same
browser. Using the personal one for this project is always a mistake.

```
Neon organization   Vercel: Consult America   org-bold-art-38408078
Account             consultamerica.net@gmail.com   (login: ConsultAmerica)
Project             ConsultAmerica-db         lively-dew-34491258
Branch              main                      br-hidden-salad-b7z9kk6b
Compute endpoint    ep-hidden-tree-b7bc4r4t
Development DB      ca_localdev
Production DB       neondb
```

Never use the personal Neon account (`shafay11august`, org "Vercel:
shafay11…", project `neon-yellow-school` / `sweet-dust-84307231`) for anything
in this repository.

## Verify before acting

Check which account you are on **before** any database or infrastructure
operation, not after it fails. If the session is on the personal account, stop
and ask Shafay to switch it. Do not work around it and do not guess.

The endpoint host is the reliable check, because it cannot be confused the way
a project name can. The host in `DATABASE_URL` must begin
`ep-hidden-tree-b7bc4r4t`:

```sh
node -e 'const fs=require("fs");const m=fs.readFileSync(".env.local","utf8").match(/^DATABASE_URL=(.*)$/m);const u=new URL(m[1].trim().replace(/^"|"$/g,""));console.log(u.hostname.split("-pooler")[0], u.pathname.slice(1).split("?")[0])'
```

A browser being signed in to the wrong account does not announce itself. The
Neon console answers with "project not found" rather than a sign-in prompt,
which reads like a broken URL and is not one.

## Development and production are separate databases

One Neon project holds both. `ca_localdev` is what localhost reads and
`neondb` is what consultamerica.com reads, and the only difference between the
two connection strings is the database name, which is exactly why it is easy
to point the wrong one at the wrong place.

- `npm run db:show` prints whichever database the app is configured for, so
  there is no way for it to disagree with the app.
- Schema migrations in `db/neon/` are applied to `ca_localdev` first. A
  migration that exists only in `ca_localdev` will break production on deploy,
  because the queries reference columns that are not there yet.
- Never modify production data or infrastructure without Shafay's explicit
  approval for that specific change. Approval for one change is not approval
  for the next.

## Credentials

Never print, commit, or put in an email a connection string, password, host or
API key. Database and project **names**, the project id and the branch id are
not secrets and may appear in code and in the admin UI.
