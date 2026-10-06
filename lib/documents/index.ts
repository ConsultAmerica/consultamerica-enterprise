/**
 * Shared candidate document API — single source of truth.
 * Backed by `documents` (+ view `candidate_documents`) and `application_documents`.
 */
export {
  archiveCandidateDocument,
  deleteCandidateDocument,
  getApplicationDocumentLinks,
  getApplicationDocuments,
  getCandidateDocuments,
  getPrimaryResume,
  getSignedDocumentUrl,
  isCandidateDocumentsReady,
  linkDocumentToApplication,
  replacePrimaryResume,
  uploadCandidateDocument,
  type ApplicationDocumentLink,
  type CandidateDocumentRow,
  type DocumentPurpose,
  type DocumentRole,
} from "@/lib/documents/candidate-documents-service";
