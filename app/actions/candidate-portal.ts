"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isExplicitDemoMode } from "@/app/lib/supabase/client";
import { getSupabaseServerAuthClient } from "@/app/lib/supabase/auth-server";
import { getSupabaseServiceClient } from "@/app/lib/supabase/server";
import { CANDIDATE_RETURN_PREFIXES, sanitizeReturnTo } from "@/lib/auth/return-to";
import { deleteApplicationDraft } from "@/lib/candidate-portal/draft-service";
import { DEMO_CANDIDATE_COOKIE, getCandidateSession } from "@/lib/candidate-portal/session";
import { getCandidatePortalStore } from "@/lib/candidate-portal/store";
import { detailedProfileSchema } from "@/lib/recruiting/detailed-profile";
import { validateCandidateDocumentFile } from "@/lib/storage/candidate-documents";

/**
 * Candidate portal mutations. Every action resolves the candidate from the
 * session first and passes only that id to the store; ids that arrive from
 * the client (document, draft, requisition) are treated as untrusted and are
 * matched against the session candidate's own rows.
 */

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const SIGN_IN = "Please sign in to your candidate account to continue.";
const GENERIC = "Something went wrong. Please try again.";

function log(event: string, error: unknown) {
  console.error("[candidate-portal]", { event, error: error instanceof Error ? error.message : "unknown" });
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

export type CandidateLoginState = { error: string | null };

/**
 * Candidate sign-in: same Supabase Auth + profiles/user_roles model as staff
 * sign-in. The account must hold the CANDIDATE role and be linked to a
 * candidate record (via the application invite); anything else is signed back
 * out so it never lands on an empty or foreign portal.
 */
export async function candidateLogin(_prev: CandidateLoginState, formData: FormData): Promise<CandidateLoginState> {
  const returnTo = sanitizeReturnTo(formData.get("returnTo") as string | null, CANDIDATE_RETURN_PREFIXES) ?? "/candidate";

  if (isExplicitDemoMode()) {
    const who = formData.get("demoCandidate");
    if (who !== "a" && who !== "b") return { error: "Choose a demo candidate." };
    (await cookies()).set(DEMO_CANDIDATE_COOKIE, who, { httpOnly: true, sameSite: "lax", path: "/" });
    redirect(returnTo);
  }

  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  const password = formData.get("password") as string | null;
  if (!email || !password) return { error: "Please enter your email and password." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email address." };

  const supabase = await getSupabaseServerAuthClient();
  if (!supabase) return { error: "Sign-in is not available right now. Please try again later." };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    const message = error?.message.toLowerCase() ?? "";
    if (message.includes("email not confirmed")) {
      return { error: "Please confirm your email address first — check your inbox for the link we sent." };
    }
    if (error && !message.includes("invalid")) console.error("[candidate-auth] sign-in failed", { code: error.code ?? null });
    return { error: "We couldn't sign you in with those details. Check your email and password and try again." };
  }

  const service = getSupabaseServiceClient();
  const { data: profile } = service
    ? await service.from("profiles").select("id").eq("auth_user_id", data.user.id).maybeSingle()
    : { data: null };
  const { data: roleRows } =
    service && profile ? await service.from("user_roles").select("role").eq("user_id", profile.id) : { data: [] };
  const { data: candidate } =
    service && profile
      ? await service.from("candidate_profiles").select("id").eq("profile_id", profile.id).limit(1)
      : { data: [] };

  const isCandidate = (roleRows ?? []).some((r) => r.role === "CANDIDATE") && (candidate ?? []).length > 0;
  if (!isCandidate) {
    await supabase.auth.signOut();
    return {
      error:
        "This sign-in is for Consult America candidates. If you work for Consult America, use the staff sign-in instead.",
    };
  }
  redirect(returnTo);
}

export async function candidateLogout() {
  if (isExplicitDemoMode()) {
    (await cookies()).delete(DEMO_CANDIDATE_COOKIE);
  } else {
    const supabase = await getSupabaseServerAuthClient();
    if (supabase) await supabase.auth.signOut();
  }
  redirect("/candidate/login");
}

// ---------------------------------------------------------------------------
// Saved jobs
// ---------------------------------------------------------------------------

export async function setJobSaved(requisitionId: string, saved: boolean): Promise<ActionResult> {
  const session = await getCandidateSession();
  if (!session) return { ok: false, error: SIGN_IN };
  if (typeof requisitionId !== "string" || !requisitionId || requisitionId.length > 120) return { ok: false, error: GENERIC };
  try {
    const store = getCandidatePortalStore();
    if (saved) await store.saveJob(session.candidateId, requisitionId);
    else await store.unsaveJob(session.candidateId, requisitionId);
    revalidatePath("/candidate/saved-jobs");
    revalidatePath("/candidate");
    return { ok: true };
  } catch (error) {
    log("saved-job", error);
    return { ok: false, error: "We couldn't update your saved jobs. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Résumé library
// ---------------------------------------------------------------------------

export async function uploadLibraryResume(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await getCandidateSession();
  if (!session) return { ok: false, error: SIGN_IN };
  const file = formData.get("resume");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Please choose a résumé file (PDF, DOC or DOCX)." };
  const validation = validateCandidateDocumentFile({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
  });
  if (!validation.ok) return { ok: false, error: validation.error };

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { documentId } = await getCandidatePortalStore().uploadResume(
      session.candidateId,
      { fileName: file.name, mimeType: validation.mimeType, fileSize: file.size, bytes },
      { makeDefault: formData.get("makeDefault") === "on" },
    );
    // Reuses the existing parser and resume_profiles store; failures are recorded, not surfaced.
    after(async () => {
      try {
        const { parseAndStoreResume } = await import("@/lib/recruiting/resume-profiles-server");
        await parseAndStoreResume({ candidateId: session.candidateId, documentId, fileName: file.name, bytes });
      } catch (error) {
        log("library-parse", error);
      }
    });
    revalidatePath("/candidate/resumes");
    revalidatePath("/candidate");
    return { ok: true, message: `${file.name} was added to your résumé library. We're reading it now.` };
  } catch (error) {
    log("library-upload", error);
    return { ok: false, error: "We couldn't upload your résumé. Please try again." };
  }
}

export async function setDefaultLibraryResume(documentId: string): Promise<ActionResult> {
  const session = await getCandidateSession();
  if (!session) return { ok: false, error: SIGN_IN };
  try {
    const ok = await getCandidatePortalStore().setDefaultResume(session.candidateId, String(documentId));
    if (!ok) return { ok: false, error: "That résumé is not available." };
    revalidatePath("/candidate/resumes");
    return { ok: true };
  } catch (error) {
    log("library-default", error);
    return { ok: false, error: GENERIC };
  }
}

export async function removeLibraryResume(documentId: string): Promise<ActionResult> {
  const session = await getCandidateSession();
  if (!session) return { ok: false, error: SIGN_IN };
  try {
    const store = getCandidatePortalStore();
    const id = String(documentId);
    if ((await store.openDraftsUsingResume(session.candidateId, id)) > 0) {
      return {
        ok: false,
        error: "This résumé is selected in an unfinished application draft. Choose another résumé in that draft, or delete the draft, first.",
      };
    }
    const result = await store.removeResume(session.candidateId, id);
    if (!result.removed) return { ok: false, error: "That résumé is not available." };
    revalidatePath("/candidate/resumes");
    revalidatePath("/candidate");
    return {
      ok: true,
      message: result.preservedForApplications
        ? "Removed from your library. The copy you submitted with your applications is kept with those applications."
        : "Résumé deleted.",
    };
  } catch (error) {
    log("library-remove", error);
    return { ok: false, error: GENERIC };
  }
}

export async function saveResumeCorrections(documentId: string, profileJson: string): Promise<ActionResult> {
  const session = await getCandidateSession();
  if (!session) return { ok: false, error: SIGN_IN };
  let profile;
  try {
    profile = detailedProfileSchema.parse(JSON.parse(profileJson));
  } catch {
    return { ok: false, error: "Please review your entries and try again." };
  }
  try {
    const saved = await getCandidatePortalStore().saveResumeReview(session.candidateId, String(documentId), profile);
    if (!saved) return { ok: false, error: "We can't save corrections until this résumé has been read." };
    revalidatePath("/candidate/resumes");
    return { ok: true, message: "Your corrections were saved." };
  } catch (error) {
    log("library-review", error);
    return { ok: false, error: GENERIC };
  }
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Links must start with http:// or https://");

const profileFormSchema = z.object({
  firstName: z.string().trim().min(1, "Please enter your first name.").max(80),
  lastName: z.string().trim().min(1, "Please enter your last name.").max(80),
  phone: z.string().trim().max(40),
  city: z.string().trim().max(120),
  state: z.string().trim().max(80),
  linkedinUrl: optionalUrl,
  portfolioUrl: optionalUrl,
  githubUrl: optionalUrl,
  professionalSummary: z.string().trim().max(1500),
  workAuthorization: z.string().trim().max(120),
});

export async function updateCandidateProfile(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await getCandidateSession();
  if (!session) return { ok: false, error: SIGN_IN };
  const read = (k: string) => (typeof formData.get(k) === "string" ? (formData.get(k) as string) : "");
  const parsed = profileFormSchema.safeParse(Object.fromEntries(Object.keys(profileFormSchema.shape).map((k) => [k, read(k)])));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please review your entries." };
  try {
    await getCandidatePortalStore().updateProfile(session.candidateId, parsed.data);
    revalidatePath("/candidate/profile");
    revalidatePath("/candidate");
    return { ok: true, message: "Your profile was saved." };
  } catch (error) {
    log("profile-update", error);
    return { ok: false, error: GENERIC };
  }
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export async function deleteDraft(draftId: string): Promise<ActionResult> {
  const session = await getCandidateSession();
  if (!session) return { ok: false, error: SIGN_IN };
  try {
    const result = await deleteApplicationDraft({ store: getCandidatePortalStore(), session }, String(draftId));
    if (!result.ok) return { ok: false, error: result.error ?? GENERIC };
    revalidatePath("/candidate/drafts");
    revalidatePath("/candidate");
    return { ok: true, message: "Draft deleted." };
  } catch (error) {
    log("draft-delete", error);
    return { ok: false, error: GENERIC };
  }
}
