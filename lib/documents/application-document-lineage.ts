/**
 * Submitted application documents are immutable.
 * Replacing a candidate's current resume must not repoint an older application.
 */
export type ApplicationDocumentLinkDecision =
  | { action: "attach"; documentId: string }
  | { action: "keep"; documentId: string }
  | { action: "reject"; documentId: string; reason: string };

export function decideApplicationDocumentLink(input: {
  existingDocumentId?: string | null;
  requestedDocumentId: string;
}): ApplicationDocumentLinkDecision {
  if (!input.existingDocumentId) {
    return { action: "attach", documentId: input.requestedDocumentId };
  }
  if (input.existingDocumentId === input.requestedDocumentId) {
    return { action: "keep", documentId: input.existingDocumentId };
  }
  return {
    action: "reject",
    documentId: input.existingDocumentId,
    reason:
      "This application already has a submitted document. Historical references are not replaced.",
  };
}
