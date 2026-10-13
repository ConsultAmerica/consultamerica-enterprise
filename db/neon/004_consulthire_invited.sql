-- ============================================================================
-- 004_consulthire_invited.sql — the interview state between "invited" and "sat"
-- ============================================================================
--
-- 003_consulthire.sql added everything an AI interview needs except one value:
-- interviews.status has no way to say "this candidate has been handed a link
-- and nobody has heard back yet".
--
-- WHY THAT MATTERS RATHER THAN BEING A NAMING QUIBBLE. The AI route writes the
-- interviews row BEFORE the candidate reaches ConsultHire, because the webhook
-- that carries the result needs a row to land on and a result arriving at a
-- missing row is a result that is lost. So between the click and the score
-- there is a real, often permanent state: the candidate was invited and may
-- never start. The four statuses in 001_init.sql were written for interviews a
-- recruiter books, where the first state genuinely is SCHEDULED, and reusing
-- SCHEDULED here would claim a time was agreed with somebody that was not.
-- Worse, "waiting on a score" and "booked for Thursday" would be the same
-- value, so the reconciliation sweep could not tell them apart.
--
-- Additive and re-runnable, like 003. DROP ... IF EXISTS then ADD rather than
-- an ALTER ... ADD guarded by an exception block: the constraint already exists
-- under this exact name, so it has to be replaced, not skipped. No row is
-- rewritten and no existing value becomes invalid, so this is safe to apply to
-- a database that is serving traffic.
-- ============================================================================

ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_status_check;

ALTER TABLE interviews ADD CONSTRAINT interviews_status_check
  CHECK (status IN ('INVITED', 'SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'));

-- The column default stays 'SCHEDULED'. Every writer names its status
-- explicitly, and changing the default would silently reclassify any future
-- insert that relied on it.
