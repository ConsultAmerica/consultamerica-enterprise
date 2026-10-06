# Migration compatibility — Jobs / Careers schema

Source schema files copied into `db/schema/` from consultamerica-functional-source.
**Do NOT apply against production until this report is reviewed.**

## Files imported

| File | Purpose |
|------|---------|
| 002_recruiting.sql | Core jobs, candidates, applications |
| 011_recruiting_rename.sql | documents rename |
| 013_rls.sql | Initial RLS |
| 014_storage_buckets.sql | Private resume storage |
| 016–020_*.sql | Document fields, purpose, immutability |
| 019_rls_security_pass.sql | Hardened RLS |
| 043_job_publication.sql | Publish/expire + public jobs policy |
| 044_job_portal_application_path.sql | INTERNAL/EXTERNAL apply path |

## Compatibility (pending live probe)

Without production credentials on this machine, status is **unknown until `db:probe` / Supabase dashboard review**:

| Concern | Expected |
|---------|----------|
| Already present | Likely if production ATS already runs |
| Missing | Only if target DB never applied 043/044 |
| Superseded | Later migrations may replace earlier RLS |
| Conflicting | Do not re-run destructive CREATE without IF NOT EXISTS |
| Safe to apply | Apply **missing** migrations only, in order, on a staging clone first |

## Rule

Reuse the **existing** Consult America Supabase project.
Do not create a second database.
Do not reset/reseed production.
