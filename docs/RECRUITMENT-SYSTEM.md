# Consult America Recruitment System

How the careers site and recruiting dashboard work: what was built, why it was
built that way, and where everything lives.

Written for someone who has not seen the code. Terms are explained the first
time they appear.

---

## 1. What this is

Two halves of one system, sharing one database.

**The public half** is the careers site. A visitor browses open roles, opens a
job, and applies. There are two ways to apply: a form (Easy Apply), or an AI
interview.

**The private half** is the recruiting dashboard at `/admin`. Staff create and
publish jobs, read applications, open résumés, move candidates through hiring
stages, and review AI interview results.

Nothing is imported from anywhere. Jobs are typed in by hand, and every
application arrives from the careers site.

---

## 2. The stack, and what each piece is for

| Piece | What it does | Why this one |
|---|---|---|
| **Next.js 16** (React) | The whole website and dashboard | One codebase serves the public site, the admin, and the APIs. |
| **Neon** (PostgreSQL) | The database: jobs, candidates, applications, interviews | Serverless Postgres. Scales to zero when idle, and supports instant database copies, which is how local development was isolated from production. |
| **Vercel Blob** | Stores the résumé files | A database is the wrong place for 5 MB PDFs. See §6. |
| **Resend** | Sends email | Notifications to recruiting, confirmations to candidates, second-round invitations. |
| **ConsultHire** | Runs the AI interviews | A separate Consult America product. See §8. |
| **Zoho CRM** | Mirrors candidates as contacts | Secondary. Neon is the source of truth; Zoho is a copy. |
| **Vercel** | Hosting | Deploys automatically when code is pushed to `main`. |

---

## 3. Environments: local and production are separate

This matters more than anything else in this document, because getting it wrong
publishes test data to the live site.

```
consultamerica.com   →  Neon database  neondb        ← real
localhost:3000       →  Neon database  ca_localdev   ← testing
```

Both live on the same Neon server. Only the database name differs, which is the
last part of the connection string. That is the entire separation mechanism and
it needs no extra infrastructure.

**Why it exists.** Originally both read `neondb`. Publishing a test job on a
laptop published it on consultamerica.com in the same instant, because
"published" is one column that both sites read. `ca_localdev` was created with
the same schema and a copy of the data, and local was pointed at it.

Two things were deliberately **not** copied into the local database:

- **Login sessions.** A session is a credential. Copying production sessions
  into a test environment would carry a real login into a place it does not
  belong. The cost is signing in again locally, once.
- **Zoho credentials.** Otherwise test applications would create real contacts
  in the live CRM.

ConsultHire has the same split: its own local database, separate from the one
its live product uses.

---

## 4. The data model

Five tables carry the system. The rule that shapes them: **one person, many
applications.**

```
jobs ────────< applications >──────── candidates
                    │
                    ├──< interviews            (AI interview result)
                    ├──< application_notes     (recruiter notes)
                    └──< application_activities(audit trail)
```

**`candidates`** — one row per person, keyed on email address. Someone who
applies to three jobs is one candidate, not three.

**`jobs`** — one row per opening. `status` is `DRAFT`, `PUBLISHED`,
`UNPUBLISHED` or `ARCHIVED`. **Only `PUBLISHED` is visible to the public.** This
single column is what the careers page filters on.

**`applications`** — one row per person per job. Carries the hiring stage
(`NEW` → `SCREENING` → `INTERVIEW` → `SHORTLISTED` → `OFFER` → `HIRED`, plus
`REJECTED` and `WITHDRAWN`), how they applied (`EASY_APPLY` or `AI_INTERVIEW`),
and the pointer to their résumé.

**`interviews`** — the AI interview: score out of 10, verdict, and the full
evaluation report.

**`application_activities`** — the audit trail. Every stage change, note and
email is written here automatically and is never edited or deleted.

---

## 5. The flows

### Creating and publishing a job

```
/admin/jobs/new  →  saved as DRAFT, reference allocated (CA-2026-0007)
      ↓
    Publish    →  status = PUBLISHED
      ↓            and, in the background, an AI interview is generated
Careers page shows it
```

Publishing does not wait for the AI interview. Generating one is a slow
language-model call, and a recruiter pressing Publish should not watch a
spinner for fifteen seconds. If generation fails the job still publishes and the
dashboard shows `Failed` with the reason, alongside a button to try again.

### Applying — Easy Apply

```
Candidate fills the form (name, email, phone, résumé)
      ↓
Résumé uploaded to Blob storage
      ↓
candidate row + application row written
      ↓
Email to recruiting (with the résumé attached) + confirmation to the candidate
      ↓
Appears in /admin/applications
```

**The résumé is mandatory.** If the upload fails, the application is refused and
the candidate is asked to retry. An earlier version filed the application anyway
and told the candidate they had succeeded, which produced applications a
recruiter could not act on and candidates who never reapplied.

### Applying — AI interview

```
Candidate fills a short form on the Consult America site
      ↓
application row created with method = AI_INTERVIEW
interview row created with status = INVITED
      ↓
Redirect to ConsultHire, carrying a signed token
      ↓
Interview starts immediately (no second form)
      ↓
ConsultHire scores it, then calls back
      ↓
Score, verdict and report written onto the application
```

**The records are created before the interview starts.** If the interview
result arrived first, there would be nowhere to put it.

### After a strong interview

A score of **8 or above** flags the candidate for second-round review. The
recruiter reads the report and decides. **Nothing is sent automatically**, and a
low score never triggers a rejection. The invitation is a button a person
presses, and once pressed it is stamped so it cannot be sent twice.

---

## 6. Where résumés are stored

**The file is not in the database.** The database stores everything else, plus a
pointer.

```
Database (Neon)           The file (Vercel Blob)
─────────────────         ──────────────────────
resume_filename           resumes/2026/CA-2026-0009/<uuid>/Name-<random>.pdf
resume_size_bytes
resume_url  ───────────→
```

Two reasons. A 5 MB PDF inside a database row slows down every query that
touches the table, including the many that never want the file. And the file has
to be delivered to a browser, which Blob does directly, while the database would
have to stream it through a server function on every view.

**The storage is private.** Pasting a résumé URL into a browser returns 403,
even for staff. Reading one goes through `/admin/applications/<id>/resume`,
which checks you are signed in, checks you are allowed to see that particular
candidate, then issues a link that works for **five minutes**.

The folder path contains a random identifier for a reason: without it,
`resumes/2026/CA-2026-0001/ahmed-resume.pdf` would be guessable from a job
reference and a name.

---

## 7. Security decisions worth knowing

**Who can open a résumé.** Being signed in is not enough. Owners and admins see
everything. A recruiter sees their own assigned applications plus the unassigned
queue, which is shared work they need to pick up. Attempts to read outside that
are refused and logged.

**Identity is never taken from a URL.** When a candidate is handed to
ConsultHire, their identity travels inside a cryptographically signed token, not
as `?email=...`. A query parameter can be edited by anyone; change it and your
interview result lands on somebody else's application. The signature makes the
link copyable but not editable, and it expires after an hour.

**Interview results are verified.** The address ConsultHire calls when an
interview finishes is a public URL. Without verification, anyone who learned it
could post a perfect score onto a hiring record. Every call carries a signature
and a timestamp, both checked before anything is written.

**Sign-out is a form, not a link.** A sign-out that works as a plain link can be
triggered by any other website embedding an invisible image pointing at it.

**Destructive actions are two-step.** Deleting a job asks for confirmation in
place, and the confirmation disarms itself after five seconds so a half-finished
delete never sits armed on an unattended screen.

---

## 8. The AI interview integration

ConsultHire is a separate product with its own database. Two concepts, kept
distinct:

- **The role interview** — one per job, created when the job is published. It
  holds the interview plan generated from the full job description, not just the
  title.
- **The candidate session** — one per applicant, created when a person applies.

Keeping them separate is what stops two candidates sharing one result.

Both ends are idempotent, meaning a repeated request changes nothing rather than
duplicating. Publishing a job twice updates one interview rather than creating a
second link that splits the applicants. A result delivered twice updates one row
rather than producing two conflicting scores.

If the callback never arrives, the result is not lost: the interview stays
visibly unfinished and can be reconciled.

---

## 9. The dashboard

**Recruitment Overview** (`/admin/dashboard`) — four figures, the hiring
pipeline, and the applications waiting on a decision, **longest wait first**. It
previously listed newest first, which puts the person who has waited longest at
the bottom. An alert appears only when something has been waiting more than
seven days; there is no permanent status line, because a line that always says
"all fine" stops being read.

**Jobs** — every job with its status, applicant count and AI interview state.
Actions live in a single menu per row.

**Applications** — the working queue. Sortable, filterable by how they applied,
with bulk stage changes. Bulk changes are applied one at a time rather than as a
single database statement, so each one still writes its audit entry.

**Candidates** — one record per person, with every job they have applied for.

---

## 10. Current state

**Live on consultamerica.com**

- Careers site, job listings, Easy Apply
- Recruiting dashboard, résumé viewing, hiring stages, bulk actions
- Mobile navigation with all services and products reachable
- `/capabilities` and `/products` pages

**Built and tested locally, not yet released**

- The AI interview integration end to end
- The Ask AI assistant answering from approved facts with no AI service calls

**Known gaps**

| Gap | Effect |
|---|---|
| Résumé storage is not configured in production | A real applicant's upload fails and the application is refused. **This is the most urgent item.** |
| Interview transcripts are not shown | The score and report are visible; the message-by-message conversation is not transmitted. |
| Re-applying leaves the old résumé file behind | Harmless, but storage accumulates. |

---

## 11. Things the system will not do, by design

- It will not record an application without a résumé.
- It will not state a company fact that has not been approved. The assistant
  says it cannot confirm something rather than guessing.
- It will not reject a candidate automatically, whatever their score.
- It will not send a candidate an email that a person did not choose to send.
- It will not show a figure it could not read. A failed query says so instead of
  displaying zero, because "no applicants" and "we could not look" are different
  answers and only one of them is true.
