# Consult America

Marketing site, insights, and recruiting platform for Consult America — engineering, AI, cloud and enterprise transformation.

**Live:** https://consultamerica.com

> Heads up if you read the old README: this is **no longer a single `index.html`**. It was ported to Next.js. `index.html` is still in the repo as the original static design reference, but it is **not served** — nothing routes to it.

## Stack

| | |
|---|---|
| Framework | Next.js 16.3.4 (App Router) |
| UI | React 19.2.8, TypeScript 5, Tailwind 4 |
| Data | Supabase (`@supabase/supabase-js` 2.x) |
| Tests | Vitest 4 |
| Hosting | Vercel, auto-deploy on push to `main` |

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the Supabase values
npm run dev                  # http://localhost:3000
```

Without Supabase values the recruiting pages fall back to in-memory demo data in development. In production that fallback is disabled on purpose — see `app/lib/supabase/server.ts`. A missing key there produces a loud "Production misconfiguration" error rather than quietly serving fake jobs.

```bash
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run lint
npm run test        # vitest
```

## Layout

```
app/
  page.tsx                    marketing homepage
  about/  careers/            static marketing pages
  insights/[slug]/            long-form articles
  jobs/                       public job board
    [slug]/apply/             easy apply + detailed apply
  candidate/                  candidate portal (login, profile, resumes, applications)
  app/recruiting/             internal ATS (jobs, candidates, applications, intake)
  api/contact                 enquiry form -> email
  api/assistant               AI assistant endpoint
  api/cron/email-intake       scheduled inbound email processing

components/marketing/         header, nav, mega-menus, footer, contact hub, enquiry form
components/jobs/              job board UI
data/                         marketing copy, products, insights articles
lib/                          recruiting domain, documents, storage, observability
db/schema/                    15 SQL migrations
styles/enterprise.css         single source of truth for the marketing look
public/                       images, logos, icons
```

### Two things worth knowing before you edit

**`styles/enterprise.css` is shared.** The homepage and every sub-page header read from it, so a change there lands everywhere. That is deliberate — the two halves of the site drifted apart before it was unified.

**The nav is one component.** `components/marketing/PrimaryNav.tsx` holds the links and the Capabilities / Industries / Products mega-menus. Both the homepage and `MarketingHeader` render it, so don't add a third copy.

## Where to change things

| I want to change… | Go to |
|---|---|
| Brand colours, spacing, type | `:root` tokens at the top of `styles/enterprise.css` |
| Nav links or mega-menus | `components/marketing/PrimaryNav.tsx` |
| Capabilities / industries / products | `data/marketing.ts` |
| Insights articles | `data/insights.ts` |
| Phone, email, office addresses | `CONTACT` in `data/marketing.ts` + the footer |
| Where the enquiry form sends | `CONTACT_TO` env var |
| Job board / ATS behaviour | `lib/recruiting/`, `components/jobs/` |

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | server only — **bypasses row-level security, never expose to the client** |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` | yes | absolute links and redirects |
| `RESEND_API_KEY` | for email | without it `/api/contact` logs the enquiry instead of sending |
| `CONTACT_FROM` | for email | must be a Resend-verified sender |
| `CONTACT_TO` | for email | enquiry destination |
| `ANTHROPIC_API_KEY` | optional | upgrades the enquiry email from a template to an AI-written routing brief. Must be **workspace-scoped** |

Never commit these. `.env*` is gitignored.

## Deploying

Push to `main`. Vercel builds and promotes automatically.

Two Vercel projects currently watch this repo, so one push deploys both:
- the project serving **consultamerica.com**
- the **Consult America** team project

## Content integrity

Stats, client names and claims on the site are real or clearly marked as illustrative with a `DEMO` tag. Don't add invented clients, awards or metrics, and keep that rule in the Insights articles too.
