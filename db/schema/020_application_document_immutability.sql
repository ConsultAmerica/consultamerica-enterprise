-- Submitted application document references are immutable.
-- A later primary-resume replacement must not rewrite an older application's resume.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM application_documents
     WHERE document_role = 'RESUME'
     GROUP BY application_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce one submitted resume per application: duplicate RESUME links exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_application_documents_one_resume
  ON application_documents (application_id)
  WHERE document_role = 'RESUME';

CREATE OR REPLACE FUNCTION reject_application_document_repoint()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.document_id IS DISTINCT FROM OLD.document_id THEN
    RAISE EXCEPTION 'Submitted application document references are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_documents_immutable_document
  ON application_documents;

CREATE TRIGGER application_documents_immutable_document
  BEFORE UPDATE OF document_id ON application_documents
  FOR EACH ROW
  EXECUTE FUNCTION reject_application_document_repoint();
