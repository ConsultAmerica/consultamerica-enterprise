"use server";

import { getSignedDocumentUrl } from "@/lib/documents/candidate-documents-service";
import { assertRecruitingStaff } from "@/lib/auth/recruiting";

/**
 * Short-lived signed URL for a candidate document, for recruiting staff only.
 * Storage paths are never sent to the browser; the URL expires in 2 minutes.
 */
export async function getRecruiterDocumentUrl(documentId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    await assertRecruitingStaff();
  } catch {
    return { ok: false, error: "Not authorized." };
  }
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(documentId)) return { ok: false, error: "Invalid document." };
  const result = await getSignedDocumentUrl(documentId, 120);
  return result.ok ? { ok: true, url: result.signedUrl } : { ok: false, error: "The document is not available." };
}
