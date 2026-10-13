-- 005_cleanup.sql
--
-- Two tables removed, for two different reasons.
--
-- playing_with_neon is Neon's own sample table, created when the project was
-- set up. Nothing in this codebase has ever mentioned it. It exists only in
-- ca_localdev and its twenty rows are sample data about nothing.
--
-- application_notes backed a Notes panel on the application detail page. It
-- held zero rows in BOTH databases and application_activities held zero
-- NOTE_ADDED rows, so nothing written by anyone is lost here: the feature was
-- built and never used. The timeline below it already records what happened to
-- an application and who did it, which is what the panel was being read for.
-- The code that wrote to this table was removed in the same change.
--
-- NOT TOUCHED, and worth saying because all three look empty and none are
-- junk:
--
--   admin_password_resets  empty because nobody has reset a password yet
--   zoho_oauth_tokens      empty in ca_localdev because the CRM was connected
--                          against production; that is why dev sync fails
--   interviews             empty in neondb because ConsultHire has not run there
--
-- Dropping any of those three would delete a working feature.
--
-- NOTE_ADDED stays in the application_activities kind CHECK list. No row uses
-- it today, and narrowing a CHECK constraint is a bigger migration than the
-- value of removing one unused label.

-- IF EXISTS on both: ca_localdev has playing_with_neon and neondb does not, so
-- this file has to be runnable against either without a branch.
DROP TABLE IF EXISTS playing_with_neon;

-- application_notes.application_id references applications, and nothing
-- references application_notes, so this needs no CASCADE. If a dependency ever
-- appears this statement fails loudly rather than quietly destroying it.
DROP TABLE IF EXISTS application_notes;

-- ---------------------------------------------------------------------------
-- Zoho CRM integration, removed.
--
-- It worked. It was authenticated against jobs@consultamerica.com and
-- delivered ten of ten jobs. What it never had was a reader: two candidate
-- records reached Zoho in the first two days and neither was looked at again,
-- and both still read Hiring_Status NEW for applications that no longer exist
-- here. A second copy of the truth that nobody reads only drifts.
--
-- ORDER MATTERS AND IT IS NOT NEGOTIABLE. enqueueZohoSync runs INSIDE the same
-- transaction as the application insert and the stage change. Dropping
-- zoho_sync_queue while deployed code still references it would fail both of
-- those writes, which means the apply form and the hiring pipeline. The code
-- switch (ZOHO_SYNC_ENABLED in lib/neon/crm.ts, and the cron route) must be
-- deployed BEFORE this file runs against a database.
--
-- WHAT DROPPING zoho_oauth_tokens MEANS. It permanently disconnects the Zoho
-- account. The two contacts already in Zoho stay in Zoho and become
-- unreachable from here. Reconnecting means re-authorising from scratch.
--
-- NOT TOUCHED: Zoho MAIL. That is a separate integration in lib/email-intake/
-- with its own credentials, and it is how candidates who email a CV to
-- jobs@consultamerica.com get into the system. It never used either of these
-- tables.
--
-- KEPT: applications.zoho_synced_at. It is the record of what did reach Zoho
-- while the integration ran, and dropping it would erase that history.

DROP TABLE IF EXISTS zoho_sync_queue;
DROP TABLE IF EXISTS zoho_oauth_tokens;
