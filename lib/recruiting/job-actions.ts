"use server";

import { revalidatePath } from "next/cache";

import { assertRecruitingStaff } from "@/lib/auth/recruiting";
import { linesFrom } from "@/lib/jobs/completeness";
import { recruitingRepository } from "@/lib/recruiting";
import type {
  CreateJobRequisitionInput,
  JobPublicationStatus,
  UpdateJobRequisitionInput,
} from "@/lib/recruiting/repository";
import type { CareerArea } from "@/types/recruiting";
import type { EmploymentType, WorkplaceType } from "@/types/organization";

/**
 * Manual job management for the recruiting workspace: create, edit, publish,
 * unpublish, archive and delete. Server actions are callable directly over
 * HTTP, so every entry point re-checks recruiting-staff authorization instead
 * of trusting the page that rendered the form.
 *
 * Nothing here throws. Production redacts thrown Server Action messages, and
 * Postgres/PostgREST detail must never reach a browser — failures come back as
 * { ok: false, error } and are logged server-side under [recruiting-jobs].
 */

export type JobActionResult =
  | { ok: true; requisitionId: string; postingSlug?: string }
  | { ok: false; error: string };

const DENIED = "You don't have access to manage jobs.";
const GENERIC = "Something went wrong. Please try again.";
const MISSING = "This job no longer exists.";

const LIMITS = { title: 200, description: 8000, line: 400, lines: 40, short: 40 } as const;

const EMPLOYMENT_TYPES: readonly EmploymentType[] = ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY"];
const WORKPLACE_TYPES: readonly WorkplaceType[] = ["REMOTE", "HYBRID", "ONSITE"];
const CAREER_AREAS: readonly CareerArea[] = [
  "experienced-professionals",
  "technology-oracle",
  "ai-data",
  "consulting",
  "early-careers",
];

function text(form: FormData, name: string, max: number): string {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

/** Textarea fields arrive as one item per line; blank lines are not items. */
function list(form: FormData, name: string): string[] {
  return linesFrom(form.get(name))
    .slice(0, LIMITS.lines)
    .map((line) => line.slice(0, LIMITS.line));
}

/** Blank, non-numeric and negative money inputs all mean "not stated". */
function money(form: FormData, name: string): number | undefined {
  const raw = text(form, name, 20).replace(/[$,\s]/g, "");
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : undefined;
}

function checked(form: FormData, name: string): boolean {
  const raw = String(form.get(name) ?? "").toLowerCase();
  return raw === "on" || raw === "true" || raw === "1" || raw === "yes";
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

type ParsedJobForm = {
  title: string;
  departmentId: string;
  positionId: string;
  locationId: string;
  employmentType: EmploymentType;
  workplaceType: WorkplaceType;
  careerArea: CareerArea;
  openings: number;
  salaryMin?: number;
  salaryMax?: number;
  experienceLevel?: string;
  applicationDeadline?: string;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  preferredQualifications: string[];
  benefits: string[];
};

function parseJobForm(form: FormData): { ok: true; form: ParsedJobForm } | { ok: false; error: string } {
  const title = text(form, "title", LIMITS.title);
  const departmentId = text(form, "departmentId", 100);
  const positionId = text(form, "positionId", 100);
  const locationId = text(form, "locationId", 100);
  const description = text(form, "description", LIMITS.description);

  // job_requisitions has NOT NULL FKs to departments/positions/locations and a
  // NOT NULL description, so these are database requirements, not house style.
  if (!title) return { ok: false, error: "Job title is required." };
  if (!departmentId) return { ok: false, error: "Select a department." };
  if (!positionId) return { ok: false, error: "Select a position." };
  if (!locationId) return { ok: false, error: "Select a location." };
  if (!description) return { ok: false, error: "About the role can't be empty." };

  const deadline = text(form, "applicationDeadline", 10);
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return { ok: false, error: "Use a valid closing date." };
  }

  const salaryMin = money(form, "salaryMin");
  const salaryMax = money(form, "salaryMax");
  if (salaryMin !== undefined && salaryMax !== undefined && salaryMin > salaryMax) {
    return { ok: false, error: "Minimum salary can't be above the maximum." };
  }

  const openings = Number(text(form, "openings", 5));

  return {
    ok: true,
    form: {
      title,
      departmentId,
      positionId,
      locationId,
      employmentType: oneOf(text(form, "employmentType", LIMITS.short), EMPLOYMENT_TYPES, "FULL_TIME"),
      workplaceType: oneOf(text(form, "workplaceType", LIMITS.short), WORKPLACE_TYPES, "ONSITE"),
      careerArea: oneOf(text(form, "careerArea", LIMITS.short), CAREER_AREAS, "experienced-professionals"),
      // openings has a CHECK (openings > 0).
      openings: Number.isFinite(openings) && openings > 0 ? Math.min(Math.round(openings), 999) : 1,
      salaryMin,
      salaryMax,
      experienceLevel: text(form, "experienceLevel", LIMITS.short) || undefined,
      // End of the chosen day in UTC, so a role closes after its last full day.
      applicationDeadline: deadline ? `${deadline}T23:59:59.000Z` : undefined,
      description,
      responsibilities: list(form, "responsibilities"),
      qualifications: list(form, "qualifications"),
      preferredQualifications: list(form, "preferredQualifications"),
      benefits: list(form, "benefits"),
    },
  };
}

/**
 * CreateJobRequisitionInput carries the department/location *names* as well as
 * their ids — the posting denormalizes them for the public page. Resolving
 * through the lookups doubles as id validation: an id that isn't in the list
 * would otherwise fail later as an opaque foreign-key error.
 */
async function resolveLookupNames(
  departmentId: string,
  locationId: string,
): Promise<{ ok: true; departmentName: string; locationName: string } | { ok: false; error: string }> {
  const [departments, locations] = await Promise.all([
    recruitingRepository.listDepartments(),
    recruitingRepository.listLocations(),
  ]);
  const department = departments.find((option) => option.id === departmentId);
  const location = locations.find((option) => option.id === locationId);
  if (!department) return { ok: false, error: "That department is no longer available. Pick another." };
  if (!location) return { ok: false, error: "That location is no longer available. Pick another." };
  return { ok: true, departmentName: department.name, locationName: location.name };
}

/**
 * Public surfaces that must reflect the change immediately: the workspace
 * list, the careers landing page and the jobs portal. The requisition detail
 * and the posting's own page are refreshed too when we know them.
 */
function revalidateJobPaths(requisitionId?: string, postingSlug?: string): void {
  revalidatePath("/app/recruiting/jobs");
  revalidatePath("/careers");
  revalidatePath("/jobs");
  if (requisitionId) revalidatePath(`/app/recruiting/jobs/${requisitionId}`);
  if (postingSlug) revalidatePath(`/jobs/${postingSlug}`);
}

function logFailure(event: string, requisitionId: string, error: unknown): void {
  console.error("[recruiting-jobs]", {
    event,
    requisitionId,
    error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
  });
}

export async function createJobAction(formData: FormData): Promise<JobActionResult> {
  try {
    await assertRecruitingStaff();
  } catch {
    return { ok: false, error: DENIED };
  }

  const parsed = parseJobForm(formData);
  if (!parsed.ok) return parsed;

  try {
    const names = await resolveLookupNames(parsed.form.departmentId, parsed.form.locationId);
    if (!names.ok) return names;

    const input: CreateJobRequisitionInput = {
      ...parsed.form,
      departmentName: names.departmentName,
      locationName: names.locationName,
      // publishNow is creation-only; editing a live job never republishes it.
      publishNow: checked(formData, "publishNow"),
    };
    const created = await recruitingRepository.createJobRequisition(input);
    revalidateJobPaths(created.requisitionId, created.postingSlug);
    console.info("[recruiting-jobs]", {
      event: "created",
      requisitionId: created.requisitionId,
      published: Boolean(created.postingSlug),
    });
    return { ok: true, requisitionId: created.requisitionId, postingSlug: created.postingSlug };
  } catch (error) {
    logFailure("create-failed", "new", error);
    return { ok: false, error: GENERIC };
  }
}

export async function updateJobAction(formData: FormData): Promise<JobActionResult> {
  try {
    await assertRecruitingStaff();
  } catch {
    return { ok: false, error: DENIED };
  }

  const requisitionId = String(formData.get("requisitionId") ?? "").trim();
  if (!requisitionId) return { ok: false, error: "Missing job reference." };

  const parsed = parseJobForm(formData);
  if (!parsed.ok) return parsed;

  try {
    const names = await resolveLookupNames(parsed.form.departmentId, parsed.form.locationId);
    if (!names.ok) return names;

    const input: UpdateJobRequisitionInput = {
      ...parsed.form,
      departmentName: names.departmentName,
      locationName: names.locationName,
    };
    const saved = await recruitingRepository.updateJobRequisition(requisitionId, input);
    if (!saved.ok) return { ok: false, error: MISSING };

    const posting = await recruitingRepository.getPostingForRequisition(requisitionId);
    revalidateJobPaths(requisitionId, posting?.slug);
    console.info("[recruiting-jobs]", { event: "updated", requisitionId });
    return { ok: true, requisitionId, postingSlug: posting?.slug };
  } catch (error) {
    logFailure("update-failed", requisitionId, error);
    return { ok: false, error: GENERIC };
  }
}

/**
 * The one status path. PUBLISHED is the only publicly visible state produced
 * here (alongside OPEN, which only the scheduled-publish maintenance job
 * sets); UNPUBLISHED, ARCHIVED and DRAFT all remove the job from /jobs and
 * /careers — see lib/jobs/eligibility.ts LIVE_JOB_STATUSES.
 */
async function setStatus(
  requisitionId: string,
  status: JobPublicationStatus,
  event: string,
): Promise<JobActionResult> {
  try {
    await assertRecruitingStaff();
  } catch {
    return { ok: false, error: DENIED };
  }
  if (!requisitionId) return { ok: false, error: "Missing job reference." };

  try {
    const result = await recruitingRepository.setJobStatus(requisitionId, status);
    if (!result) return { ok: false, error: MISSING };
    revalidateJobPaths(requisitionId, result.postingSlug);
    console.info("[recruiting-jobs]", { event, requisitionId, status });
    return { ok: true, requisitionId, postingSlug: result.postingSlug };
  } catch (error) {
    logFailure(`${event}-failed`, requisitionId, error);
    return { ok: false, error: GENERIC };
  }
}

export async function publishJobAction(requisitionId: string): Promise<JobActionResult> {
  return setStatus(requisitionId, "PUBLISHED", "published");
}

export async function unpublishJobAction(requisitionId: string): Promise<JobActionResult> {
  return setStatus(requisitionId, "UNPUBLISHED", "unpublished");
}

export async function archiveJobAction(requisitionId: string): Promise<JobActionResult> {
  return setStatus(requisitionId, "ARCHIVED", "archived");
}

/**
 * Hard delete, and only for a job nobody has applied to: applications hang off
 * the requisition, so deleting one that has them would orphan candidate
 * records. Archiving is the correct action in that case and the error says so.
 */
export async function deleteJobAction(requisitionId: string): Promise<JobActionResult> {
  try {
    await assertRecruitingStaff();
  } catch {
    return { ok: false, error: DENIED };
  }
  if (!requisitionId) return { ok: false, error: "Missing job reference." };

  try {
    const result = await recruitingRepository.deleteJobRequisition(requisitionId);
    if (!result.ok) {
      if (result.blockedByApplications) {
        const count = result.blockedByApplications;
        return {
          ok: false,
          error: `This job has ${count} application${count === 1 ? "" : "s"}. Archive it instead so the candidate records are kept.`,
        };
      }
      return { ok: false, error: MISSING };
    }
    revalidateJobPaths(requisitionId);
    console.info("[recruiting-jobs]", { event: "deleted", requisitionId });
    return { ok: true, requisitionId };
  } catch (error) {
    logFailure("delete-failed", requisitionId, error);
    return { ok: false, error: GENERIC };
  }
}
