import { getSupabaseServiceClient } from "@/app/lib/supabase/server";
import { seedDepartments, seedLocations } from "@/data/recruiting/seed";
import { isPubliclyOpen } from "@/lib/jobs/eligibility";
import type { EmploymentType } from "@/types/organization";
import type {
  ApplicationQueueItem,
  CandidateApplicationSummary,
  CandidateInterviewSummary,
  CandidateMatchScoreSummary,
  CandidateProfileDetail,
  CandidateListItem,
  CreateJobRequisitionInput,
  JobDescriptionInput,
  JobDetail,
  JobListItem,
  RecruitingApplicationQueueReads,
  RecruitingApplicationWrites,
  RecruitingCandidateReads,
  RecruitingCandidateSelfWrites,
  RecruitingDashboardReads,
  RecruitingJobReads,
  RecruitingJobWrites,
  RecruitingMatchScoreReads,
  RecruitingOfferWrites,
  RecruitingPipelineWrites,
  RecruitingRepository,
  SubmitApplicationInput,
  SubmitApplicationResult,
  UpdateCandidateContactInfoInput,
} from "@/lib/recruiting/repository";
import {
  APPLICATION_PIPELINE,
  APPLICATION_TERMINAL_STATUSES,
  type Application,
  type ApplicationStatus,
  type CandidateProfile,
  type CandidateSkill,
  type Document,
  type Education,
  type Experience,
  type Interview,
  type InterviewFeedback,
  type Job,
  type JobRequisition,
  type Offer,
  type RecruitingActivity,
} from "@/types/recruiting";

/** Public reference numbers for postings (one batched read; missing ones stay undefined). */
async function withRequisitionNumbers(
  client: NonNullable<ReturnType<typeof getSupabaseServiceClient>>,
  postings: Job[],
): Promise<Job[]> {
  const ids = [...new Set(postings.map((posting) => posting.requisitionId).filter(Boolean))];
  if (ids.length === 0) return postings;
  const { data } = await client.from("job_requisitions").select("id, requisition_number").in("id", ids);
  const numbers = new Map((data ?? []).map((row) => [row.id as string, row.requisition_number as string]));
  return postings.map((posting) => ({ ...posting, requisitionNumber: numbers.get(posting.requisitionId) || undefined }));
}

/** snake_case (Postgres) -> camelCase (app) row mappers, one per table. */

function mapPosting(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    requisitionId: row.requisition_id as string,
    slug: row.slug as string,
    title: row.title as string,
    summary: row.summary as string,
    description: row.description as string,
    careerArea: row.career_area as Job["careerArea"],
    departmentName: row.department_name as string,
    locationName: row.location_name as string,
    workplaceType: row.workplace_type as Job["workplaceType"],
    employmentType: row.employment_type as Job["employmentType"],
    responsibilities: (row.responsibilities as string[]) ?? [],
    qualifications: (row.qualifications as string[]) ?? [],
    preferredQualifications:
      (row.preferred_qualifications as string[]) ?? [],
    status: row.status as Job["status"],
    publishedAt: (row.published_at as string) ?? undefined,
    publishAt: (row.publish_at as string) ?? undefined,
    expiresAt: (row.expires_at as string) ?? undefined,
    applicationDeadline: (row.application_deadline as string) ?? undefined,
    featured: Boolean(row.featured),
    experienceLevel: (row.experience_level as string) ?? undefined,
    closedAt: (row.closed_at as string) ?? undefined,
    isDemo: Boolean(row.is_demo),
    applicationType: row.application_type === "EXTERNAL" ? "EXTERNAL" : "INTERNAL",
    externalApplyUrl: (row.external_apply_url as string) ?? undefined,
    companyName: (row.company_name as string) ?? undefined,
    companySummary: (row.company_summary as string) ?? undefined,
    skills: (row.skills as string[]) ?? [],
    salaryMin: (row.salary_min as number) ?? undefined,
    salaryMax: (row.salary_max as number) ?? undefined,
    salaryPeriod: row.salary_period === "HOUR" ? "HOUR" : row.salary_period === "YEAR" ? "YEAR" : undefined,
    verified: row.verified === true,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapRequisition(row: Record<string, unknown>): JobRequisition {
  return {
    id: row.id as string,
    requisitionNumber: row.requisition_number as string,
    title: row.title as string,
    departmentId: row.department_id as string,
    positionId: row.position_id as string,
    locationId: row.location_id as string,
    hiringManagerUserId: (row.hiring_manager_user_id as string) ?? undefined,
    recruiterUserId: (row.recruiter_user_id as string) ?? undefined,
    employmentType: row.employment_type as JobRequisition["employmentType"],
    workplaceType: row.workplace_type as JobRequisition["workplaceType"],
    careerArea: row.career_area as JobRequisition["careerArea"],
    openings: row.openings as number,
    salaryMin: (row.salary_min as number) ?? undefined,
    salaryMax: (row.salary_max as number) ?? undefined,
    currency: row.currency as string,
    description: row.description as string,
    responsibilities: (row.responsibilities as string[]) ?? [],
    qualifications: (row.qualifications as string[]) ?? [],
    preferredQualifications:
      (row.preferred_qualifications as string[]) ?? [],
    targetHireDate: (row.target_hire_date as string) ?? undefined,
    status: row.status as JobRequisition["status"],
    createdByUserId: (row.created_by_user_id as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapCandidate(row: Record<string, unknown>): CandidateProfile {
  return {
    id: row.id as string,
    profileId: (row.profile_id as string) ?? undefined,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    preferredName: (row.preferred_name as string) ?? undefined,
    email: row.email as string,
    phone: (row.phone as string) ?? undefined,
    city: (row.city as string) ?? undefined,
    state: (row.state as string) ?? undefined,
    professionalSummary: (row.professional_summary as string) ?? undefined,
    linkedinUrl: (row.linkedin_url as string) ?? undefined,
    portfolioUrl: (row.portfolio_url as string) ?? undefined,
    githubUrl: (row.github_url as string) ?? undefined,
    workAuthorization: (row.work_authorization as string) ?? undefined,
    willingToRelocate: (row.willing_to_relocate as boolean) ?? undefined,
    source: (row.source as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapApplication(row: Record<string, unknown>): Application {
  return {
    id: row.id as string,
    applicationNumber: row.application_number as string,
    candidateId: row.candidate_id as string,
    requisitionId: row.requisition_id as string,
    jobId: row.job_id as string,
    status: row.status as ApplicationStatus,
    coverLetter: (row.cover_letter as string) ?? undefined,
    additionalInformation:
      (row.additional_information as string) ?? undefined,
    appliedAt: row.applied_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapOffer(row: Record<string, unknown>): Offer {
  return {
    id: row.id as string,
    applicationId: row.application_id as string,
    offerNumber: row.offer_number as string,
    status: row.status as Offer["status"],
    baseSalary: (row.base_salary as number) ?? undefined,
    hourlyRate: (row.hourly_rate as number) ?? undefined,
    currency: row.currency as string,
    employmentType: row.employment_type as Offer["employmentType"],
    workplaceType: row.workplace_type as Offer["workplaceType"],
    startDate: row.start_date as string,
    expirationDate: (row.expiration_date as string) ?? undefined,
    termsSummary: (row.terms_summary as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapInterview(row: Record<string, unknown>): Interview {
  return {
    id: row.id as string,
    applicationId: row.application_id as string,
    interviewType: row.interview_type as Interview["interviewType"],
    status: row.status as Interview["status"],
    scheduledAt: row.scheduled_at as string,
    durationMinutes: row.duration_minutes as number,
    locationOrLink: (row.location_or_link as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapExperience(row: Record<string, unknown>): Experience {
  return {
    id: row.id as string,
    candidateId: row.candidate_id as string,
    company: row.company as string,
    title: row.title as string,
    location: (row.location as string) ?? undefined,
    startDate: row.start_date as string,
    endDate: (row.end_date as string) ?? undefined,
    isCurrent: Boolean(row.is_current),
    description: (row.description as string) ?? undefined,
  };
}

function mapEducation(row: Record<string, unknown>): Education {
  return {
    id: row.id as string,
    candidateId: row.candidate_id as string,
    institution: row.institution as string,
    degree: (row.degree as string) ?? undefined,
    fieldOfStudy: (row.field_of_study as string) ?? undefined,
    startDate: (row.start_date as string) ?? undefined,
    endDate: (row.end_date as string) ?? undefined,
  };
}

/** `skillName` comes from a joined lookup against `skills` — not a column on `candidate_skills` itself. */
function mapSkill(row: Record<string, unknown>, skillName: string): CandidateSkill {
  return {
    id: row.id as string,
    candidateId: row.candidate_id as string,
    skillId: row.skill_id as string,
    skill: skillName,
    proficiency: (row.proficiency as string) ?? undefined,
  };
}

function mapDocument(row: Record<string, unknown>): Document {
  return {
    id: row.id as string,
    candidateId: row.candidate_id as string,
    userId: (row.user_id as string) ?? undefined,
    documentType: row.document_type as Document["documentType"],
    fileName: row.file_name as string,
    storagePath: row.storage_path as string,
    mimeType: (row.mime_type as string) ?? undefined,
    fileSize: (row.file_size as number) ?? undefined,
    uploadedAt: row.uploaded_at as string,
    updatedAt: (row.updated_at as string) ?? undefined,
    isPrimaryResume: Boolean(row.is_primary_resume),
    status: (row.status as Document["status"]) ?? "ACTIVE",
  };
}

function mapFeedback(row: Record<string, unknown>): InterviewFeedback {
  return {
    id: row.id as string,
    interviewId: row.interview_id as string,
    panelMemberId: row.panel_member_id as string,
    recommendation: row.recommendation as InterviewFeedback["recommendation"],
    score: (row.score as number) ?? undefined,
    strengths: (row.strengths as string) ?? undefined,
    concerns: (row.concerns as string) ?? undefined,
    notes: (row.notes as string) ?? undefined,
    submittedAt: row.submitted_at as string,
  };
}

function mapActivity(row: Record<string, unknown>): RecruitingActivity {
  return {
    id: row.id as string,
    candidateId: (row.candidate_id as string) ?? undefined,
    applicationId: (row.application_id as string) ?? undefined,
    requisitionId: (row.requisition_id as string) ?? undefined,
    activityType: row.activity_type as string,
    summary: row.summary as string,
    createdByUserId: (row.created_by_user_id as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

const ALL_APPLICATION_STATUSES: ApplicationStatus[] = [
  ...APPLICATION_PIPELINE,
  ...APPLICATION_TERMINAL_STATUSES,
];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function createSupabaseRecruitingRepository(): RecruitingRepository &
  RecruitingDashboardReads &
  RecruitingCandidateReads &
  RecruitingCandidateSelfWrites &
  RecruitingJobReads &
  RecruitingJobWrites &
  RecruitingApplicationWrites &
  RecruitingPipelineWrites &
  RecruitingOfferWrites &
  RecruitingApplicationQueueReads &
  RecruitingMatchScoreReads {
  return {
    async listPublishedPostings() {
      const client = getSupabaseServiceClient();
      if (!client) return [];

      let query = client
        .from("jobs")
        .select("*")
        .in("status", ["PUBLISHED", "OPEN"]);
      // Demo rows stay visible in development for design review; production
      // excludes them here and again in includeOnPublicSite (lib/jobs.ts).
      if (process.env.NODE_ENV === "production") query = query.eq("is_demo", false);

      const { data } = await query.order("published_at", { ascending: false });

      const postings = (data ?? []).map(mapPosting).filter((posting) => isPubliclyOpen(posting));
      return withRequisitionNumbers(client, postings);
    },

    async getPostingBySlug(slug: string) {
      const client = getSupabaseServiceClient();
      if (!client) return undefined;

      const { data } = await client
        .from("jobs")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      const posting = data ? mapPosting(data) : undefined;
      return posting && isPubliclyOpen(posting) ? posting : undefined;
    },

    async getPostingBySlugAny(slug: string) {
      const client = getSupabaseServiceClient();
      if (!client) return undefined;

      const { data } = await client.from("jobs").select("*").eq("slug", slug).maybeSingle();
      const posting = data ? mapPosting(data) : undefined;
      if (!posting || posting.status === "DRAFT") return undefined;
      return (await withRequisitionNumbers(client, [posting]))[0];
    },

    async getRequisitionById(id: string) {
      const client = getSupabaseServiceClient();
      if (!client) return undefined;

      const { data } = await client
        .from("job_requisitions")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      return data ? mapRequisition(data) : undefined;
    },

    async getCandidateByEmail(email: string) {
      const client = getSupabaseServiceClient();
      if (!client) return undefined;

      const { data } = await client
        .from("candidate_profiles")
        .select("*")
        .ilike("email", email.trim())
        .maybeSingle();

      return data ? mapCandidate(data) : undefined;
    },

    async listLatestMatchScoresForPairs(pairs) {
      const client = getSupabaseServiceClient();
      if (!client || pairs.length === 0) return [];

      const requisitionIds = [...new Set(pairs.map((p) => p.requisitionId))];
      const candidateIds = [...new Set(pairs.map((p) => p.candidateId))];
      const wanted = new Set(pairs.map((p) => `${p.candidateId}:${p.requisitionId}`));

      const { data } = await client
        .from("jd_analysis")
        .select("candidate_id, job_id, match_score, matched_skills, missing_skills, created_at")
        .in("job_id", requisitionIds)
        .in("candidate_id", candidateIds)
        .order("created_at", { ascending: false });

      const latest = new Map<string, CandidateMatchScoreSummary>();
      for (const row of data ?? []) {
        const candidateId = row.candidate_id as string;
        const requisitionId = row.job_id as string | null;
        if (!requisitionId) continue;
        const key = `${candidateId}:${requisitionId}`;
        if (!wanted.has(key) || latest.has(key)) continue;
        latest.set(key, {
          candidateId,
          requisitionId,
          score: Number(row.match_score ?? 0),
          matchedSkills: Array.isArray(row.matched_skills) ? (row.matched_skills as string[]) : [],
          missingSkills: Array.isArray(row.missing_skills) ? (row.missing_skills as string[]) : [],
          createdAt: row.created_at as string,
        });
      }
      return [...latest.values()];
    },

    async listApplicationsByRequisition(requisitionId: string) {
      const client = getSupabaseServiceClient();
      if (!client) return [];

      const { data } = await client
        .from("applications")
        .select("*")
        .eq("requisition_id", requisitionId);

      return (data ?? []).map(mapApplication);
    },

    async getApplicationById(applicationId: string) {
      const client = getSupabaseServiceClient();
      if (!client) return undefined;

      const { data } = await client
        .from("applications")
        .select("*")
        .eq("id", applicationId)
        .maybeSingle();

      return data ? mapApplication(data) : undefined;
    },

    async getOfferByApplicationId(applicationId: string) {
      const client = getSupabaseServiceClient();
      if (!client) return undefined;

      const { data } = await client
        .from("offers")
        .select("*")
        .eq("application_id", applicationId)
        .maybeSingle();

      return data ? mapOffer(data) : undefined;
    },

    async countCandidates() {
      const client = getSupabaseServiceClient();
      if (!client) return 0;

      const { count } = await client
        .from("candidate_profiles")
        .select("id", { count: "exact", head: true });

      return count ?? 0;
    },

    async countOpenRequisitions() {
      const client = getSupabaseServiceClient();
      if (!client) return 0;

      const { count } = await client
        .from("job_requisitions")
        .select("id", { count: "exact", head: true })
        .in("status", ["APPROVED", "PUBLISHED"]);

      return count ?? 0;
    },

    async getApplicationPipelineCounts() {
      const counts = Object.fromEntries(
        ALL_APPLICATION_STATUSES.map((status) => [status, 0]),
      ) as Record<ApplicationStatus, number>;

      const client = getSupabaseServiceClient();
      if (!client) return counts;

      const { data } = await client.from("applications").select("status");

      for (const row of data ?? []) {
        const status = row.status as ApplicationStatus;
        counts[status] = (counts[status] ?? 0) + 1;
      }

      return counts;
    },

    async listUpcomingInterviews(limit: number) {
      const client = getSupabaseServiceClient();
      if (!client) return [];

      const { data } = await client
        .from("interviews")
        .select("*")
        .eq("status", "SCHEDULED")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(limit);

      return (data ?? []).map(mapInterview);
    },

    async listRecentHires(limit: number) {
      const client = getSupabaseServiceClient();
      if (!client) return [];

      const { data } = await client
        .from("applications")
        .select("*")
        .eq("status", "HIRED")
        .order("updated_at", { ascending: false })
        .limit(limit);

      return (data ?? []).map(mapApplication);
    },

    async listCandidateSummaries() {
      const client = getSupabaseServiceClient();
      if (!client) return [];

      const [
        { data: candidateRows },
        { data: applicationRows },
        { data: postingRows },
        { data: skillLinkRows },
      ] = await Promise.all([
        client.from("candidate_profiles").select("*"),
        client.from("applications").select("*"),
        client.from("jobs").select("id, title, location_name"),
        client.from("candidate_skills").select("candidate_id, skill_id"),
      ]);

      const skillIds = [
        ...new Set((skillLinkRows ?? []).map((row) => row.skill_id as string)),
      ];
      const { data: skillNameRows } = skillIds.length
        ? await client.from("skills").select("id, name").in("id", skillIds)
        : { data: [] as Record<string, unknown>[] };
      const skillNameById = new Map(
        (skillNameRows ?? []).map((row) => [row.id as string, row.name as string]),
      );
      const skillsByCandidate = new Map<string, string[]>();
      for (const row of skillLinkRows ?? []) {
        const candidateId = row.candidate_id as string;
        const name = skillNameById.get(row.skill_id as string);
        if (!name) continue;
        const list = skillsByCandidate.get(candidateId) ?? [];
        list.push(name);
        skillsByCandidate.set(candidateId, list);
      }

      const postingById = new Map(
        (postingRows ?? []).map((row) => [row.id as string, row]),
      );

      const latestApplicationByCandidate = new Map<
        string,
        Record<string, unknown>
      >();
      for (const row of applicationRows ?? []) {
        const candidateId = row.candidate_id as string;
        const existing = latestApplicationByCandidate.get(candidateId);
        if (
          !existing ||
          new Date(row.applied_at as string) >
            new Date(existing.applied_at as string)
        ) {
          latestApplicationByCandidate.set(candidateId, row);
        }
      }

      return (candidateRows ?? []).map((row): CandidateListItem => {
        const candidate = mapCandidate(row);
        const application = latestApplicationByCandidate.get(candidate.id);
        const posting = application
          ? postingById.get(application.job_id as string)
          : undefined;

        return {
          candidateId: candidate.id,
          name: `${candidate.firstName} ${candidate.lastName}`,
          email: candidate.email,
          role: (posting?.title as string) ?? "—",
          requisitionId: application?.requisition_id as string | undefined,
          applicationNumber:
            (application?.application_number as string) ?? "—",
          stage: (application?.status as ApplicationStatus) ?? undefined,
          location: (posting?.location_name as string) ?? "—",
          source: candidate.source,
          workAuthorization: candidate.workAuthorization,
          appliedAt: application?.applied_at as string | undefined,
          lastActivityAt:
            (application?.updated_at as string) ?? candidate.updatedAt,
          skills: skillsByCandidate.get(candidate.id) ?? [],
        };
      });
    },

    async listApplicationsQueue(): Promise<ApplicationQueueItem[]> {
      const client = getSupabaseServiceClient();
      if (!client) return [];

      const [
        { data: applicationRows },
        { data: candidateRows },
        { data: postingRows },
        { data: requisitionRows },
        { data: activityRows },
      ] = await Promise.all([
        client.from("applications").select("*"),
        client.from("candidate_profiles").select("id, first_name, last_name, email"),
        client.from("jobs").select("id, title, department_name, location_name"),
        client
          .from("job_requisitions")
          .select("id, title, department_id, location_id, recruiter_user_id, hiring_manager_user_id"),
        client
          .from("recruiting_activities")
          .select("application_id, created_at")
          .order("created_at", { ascending: false }),
      ]);

      const candidateById = new Map((candidateRows ?? []).map((row) => [row.id as string, row]));
      const postingById = new Map((postingRows ?? []).map((row) => [row.id as string, row]));
      const requisitionById = new Map(
        (requisitionRows ?? []).map((row) => [row.id as string, row]),
      );

      const profileIds = [
        ...new Set(
          (requisitionRows ?? [])
            .flatMap((row) => [row.recruiter_user_id, row.hiring_manager_user_id])
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const { data: profileRows } = profileIds.length
        ? await client.from("profiles").select("id, display_name").in("id", profileIds)
        : { data: [] as Record<string, unknown>[] };
      const displayNameByProfileId = new Map(
        (profileRows ?? []).map((row) => [row.id as string, row.display_name as string]),
      );

      const lastActivityByApplication = new Map<string, string>();
      for (const row of activityRows ?? []) {
        const applicationId = row.application_id as string;
        if (!lastActivityByApplication.has(applicationId)) {
          lastActivityByApplication.set(applicationId, row.created_at as string);
        }
      }

      const departmentNameById = new Map(seedDepartments.map((d) => [d.id, d.name]));
      const locationNameById = new Map(seedLocations.map((l) => [l.id, l.name]));

      return (applicationRows ?? []).map((row): ApplicationQueueItem => {
        const candidate = candidateById.get(row.candidate_id as string);
        const posting = postingById.get(row.job_id as string);
        const requisition = requisitionById.get(row.requisition_id as string);

        return {
          applicationId: row.id as string,
          applicationNumber: row.application_number as string,
          candidateId: row.candidate_id as string,
          candidateName: candidate
            ? `${candidate.first_name as string} ${candidate.last_name as string}`
            : "—",
          candidateEmail: (candidate?.email as string) ?? "—",
          jobTitle: (posting?.title as string) ?? (requisition?.title as string) ?? "—",
          requisitionId: row.requisition_id as string | undefined,
          departmentName:
            (posting?.department_name as string) ??
            departmentNameById.get(requisition?.department_id as string) ??
            "—",
          locationName:
            (posting?.location_name as string) ??
            locationNameById.get(requisition?.location_id as string) ??
            "—",
          appliedAt: row.applied_at as string,
          status: row.status as ApplicationStatus,
          recruiterUserId: (requisition?.recruiter_user_id as string) ?? undefined,
          recruiterName: requisition?.recruiter_user_id
            ? displayNameByProfileId.get(requisition.recruiter_user_id as string)
            : undefined,
          hiringManagerUserId: (requisition?.hiring_manager_user_id as string) ?? undefined,
          hiringManagerName: requisition?.hiring_manager_user_id
            ? displayNameByProfileId.get(requisition.hiring_manager_user_id as string)
            : undefined,
          lastActivityAt:
            lastActivityByApplication.get(row.id as string) ?? (row.updated_at as string),
          skills: [],
        };
      });
    },

    async getCandidateProfile(candidateId: string) {
      const client = getSupabaseServiceClient();
      if (!client) return undefined;

      const { data: candidateRow } = await client
        .from("candidate_profiles")
        .select("*")
        .eq("id", candidateId)
        .maybeSingle();

      if (!candidateRow) return undefined;

      const [
        { data: applicationRows },
        { data: experienceRows },
        { data: educationRows },
        { data: skillRows },
        { data: documentRows },
        { data: activityRows },
      ] = await Promise.all([
        client.from("applications").select("*").eq("candidate_id", candidateId),
        client
          .from("experiences")
          .select("*")
          .eq("candidate_id", candidateId)
          .order("start_date", { ascending: false }),
        client
          .from("education")
          .select("*")
          .eq("candidate_id", candidateId),
        client.from("candidate_skills").select("*").eq("candidate_id", candidateId),
        client
          .from("documents")
          .select("*")
          .eq("candidate_id", candidateId)
          .in("status", ["ACTIVE", "ARCHIVED"])
          .order("uploaded_at", { ascending: false }),
        client
          .from("recruiting_activities")
          .select("*")
          .eq("candidate_id", candidateId)
          .order("created_at", { ascending: false }),
      ]);

      const skillIds = [
        ...new Set((skillRows ?? []).map((row) => row.skill_id as string)),
      ];
      const { data: skillNameRows } = skillIds.length
        ? await client.from("skills").select("id, name").in("id", skillIds)
        : { data: [] as Record<string, unknown>[] };
      const skillNameById = new Map(
        (skillNameRows ?? []).map((row) => [row.id as string, row.name as string]),
      );

      const applicationIds = (applicationRows ?? []).map(
        (row) => row.id as string,
      );
      const requisitionIds = [
        ...new Set((applicationRows ?? []).map((row) => row.requisition_id as string)),
      ];
      const jobIds = [
        ...new Set((applicationRows ?? []).map((row) => row.job_id as string)),
      ];

      const [
        { data: requisitionRows },
        { data: postingRows },
        { data: interviewRows },
      ] = await Promise.all([
        requisitionIds.length
          ? client
              .from("job_requisitions")
              .select("id, title, requisition_number, employment_type")
              .in("id", requisitionIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        jobIds.length
          ? client
              .from("jobs")
              .select("id, location_name")
              .in("id", jobIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        applicationIds.length
          ? client.from("interviews").select("*").in("application_id", applicationIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ]);

      const requisitionById = new Map(
        (requisitionRows ?? []).map((row) => [row.id as string, row]),
      );
      const postingById = new Map(
        (postingRows ?? []).map((row) => [row.id as string, row]),
      );
      const applicationById = new Map(
        (applicationRows ?? []).map((row) => [row.id as string, row]),
      );

      const applications: CandidateApplicationSummary[] = (
        applicationRows ?? []
      ).map((row) => {
        const requisition = requisitionById.get(row.requisition_id as string);
        const posting = postingById.get(row.job_id as string);
        return {
          applicationId: row.id as string,
          applicationNumber: row.application_number as string,
          requisitionId: row.requisition_id as string,
          requisitionTitle: (requisition?.title as string) ?? "—",
          requisitionNumber:
            (requisition?.requisition_number as string) ?? "—",
          postingLocation: (posting?.location_name as string) ?? "—",
          employmentType:
            (requisition?.employment_type as EmploymentType) ?? undefined,
          status: row.status as ApplicationStatus,
          appliedAt: row.applied_at as string,
          updatedAt: row.updated_at as string,
        };
      });

      const interviews: CandidateInterviewSummary[] = (interviewRows ?? []).map(
        (row) => {
          const application = applicationById.get(row.application_id as string);
          const requisition = application
            ? requisitionById.get(application.requisition_id as string)
            : undefined;
          return {
            ...mapInterview(row),
            applicationNumber:
              (application?.application_number as string) ?? "—",
            requisitionTitle: (requisition?.title as string) ?? "—",
          };
        },
      );

      const interviewIds = interviews.map((interview) => interview.id);
      const { data: feedbackRows } = interviewIds.length
        ? await client.from("interview_feedback").select("*").in(
            "interview_id",
            interviewIds,
          )
        : { data: [] as Record<string, unknown>[] };

      const { data: appDocRows } = applicationIds.length
        ? await client
            .from("application_documents")
            .select("*")
            .in("application_id", applicationIds)
        : { data: [] as Record<string, unknown>[] };

      const [{ data: historyRows }, { data: offerRows }] = await Promise.all([
        applicationIds.length
          ? client
              .from("application_status_history")
              .select("*")
              .in("application_id", applicationIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        applicationIds.length
          ? client
              .from("offers")
              .select("*")
              .in("application_id", applicationIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ]);

      const applicationTitleById = new Map(
        applications.map((app) => [app.applicationId, app.requisitionTitle]),
      );
      const applicationAppliedAtById = new Map(
        applications.map((app) => [app.applicationId, app.appliedAt]),
      );

      const profile: CandidateProfileDetail = {
        candidate: mapCandidate(candidateRow),
        applications,
        experience: (experienceRows ?? []).map(mapExperience),
        education: (educationRows ?? []).map(mapEducation),
        skills: (skillRows ?? []).map((row) =>
          mapSkill(row, skillNameById.get(row.skill_id as string) ?? "—"),
        ),
        documents: (documentRows ?? []).map(mapDocument),
        applicationDocumentLinks: (appDocRows ?? []).map((row) => ({
          id: row.id as string,
          applicationId: row.application_id as string,
          documentId: row.document_id as string,
          purpose: ((row.document_role as string) ??
            (row.purpose as string)) as
            | "RESUME"
            | "COVER_LETTER"
            | "SUPPORTING"
            | "OTHER"
            | "PORTFOLIO"
            | undefined,
          documentRole: ((row.document_role as string) ??
            (row.purpose as string)) as
            | "RESUME"
            | "COVER_LETTER"
            | "SUPPORTING"
            | "OTHER"
            | "PORTFOLIO"
            | undefined,
          createdAt:
            (row.attached_at as string) ?? (row.created_at as string),
          attachedAt:
            (row.attached_at as string) ?? (row.created_at as string),
          requisitionTitle: applicationTitleById.get(
            row.application_id as string,
          ),
          appliedAt: applicationAppliedAtById.get(
            row.application_id as string,
          ),
        })),
        statusHistory: (historyRows ?? []).map((row) => ({
          id: row.id as string,
          applicationId: row.application_id as string,
          fromStatus: (row.from_status as ApplicationStatus) ?? undefined,
          toStatus: row.to_status as ApplicationStatus,
          changedByUserId: (row.changed_by_user_id as string) ?? undefined,
          note: (row.note as string) ?? undefined,
          createdAt: row.created_at as string,
        })),
        offers: (offerRows ?? []).map(mapOffer),
        interviews,
        feedback: (feedbackRows ?? []).map(mapFeedback),
        activities: (activityRows ?? []).map(mapActivity),
      };

      return profile;
    },

    async listJobSummaries(): Promise<JobListItem[]> {
      const client = getSupabaseServiceClient();
      if (!client) return [];

      const [
        { data: requisitionRows },
        { data: departmentRows },
        { data: locationRows },
        { data: applicationRows },
      ] = await Promise.all([
        client.from("job_requisitions").select("*"),
        client.from("departments").select("id, name"),
        client.from("locations").select("id, name"),
        client.from("applications").select("requisition_id"),
      ]);

      const departmentById = new Map(
        (departmentRows ?? []).map((row) => [row.id as string, row.name as string]),
      );
      const locationById = new Map(
        (locationRows ?? []).map((row) => [row.id as string, row.name as string]),
      );
      const candidateCountByRequisition = new Map<string, number>();
      for (const row of applicationRows ?? []) {
        const id = row.requisition_id as string;
        candidateCountByRequisition.set(
          id,
          (candidateCountByRequisition.get(id) ?? 0) + 1,
        );
      }

      return (requisitionRows ?? [])
        .map((row): JobListItem => {
          const requisition = mapRequisition(row);
          return {
            requisitionId: requisition.id,
            requisitionNumber: requisition.requisitionNumber,
            title: requisition.title,
            departmentName: departmentById.get(requisition.departmentId) ?? "—",
            locationName: locationById.get(requisition.locationId) ?? "—",
            workplaceType: requisition.workplaceType,
            employmentType: requisition.employmentType,
            status: requisition.status,
            candidateCount: candidateCountByRequisition.get(requisition.id) ?? 0,
            updatedAt: requisition.updatedAt,
          };
        })
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
    },

    async getJobDetail(requisitionId: string): Promise<JobDetail | undefined> {
      const client = getSupabaseServiceClient();
      if (!client) return undefined;

      const { data: requisitionRow } = await client
        .from("job_requisitions")
        .select("*")
        .eq("id", requisitionId)
        .maybeSingle();
      if (!requisitionRow) return undefined;

      const requisition = mapRequisition(requisitionRow);

      const [
        { data: departmentRow },
        { data: locationRow },
        { data: postingRow },
        { data: applicationRows },
      ] = await Promise.all([
        client
          .from("departments")
          .select("name")
          .eq("id", requisition.departmentId)
          .maybeSingle(),
        client
          .from("locations")
          .select("name")
          .eq("id", requisition.locationId)
          .maybeSingle(),
        client
          .from("jobs")
          .select("slug, status")
          .eq("requisition_id", requisitionId)
          .maybeSingle(),
        client
          .from("applications")
          .select("status")
          .eq("requisition_id", requisitionId),
      ]);

      const pipelineCounts = Object.fromEntries(
        ALL_APPLICATION_STATUSES.map((status) => [status, 0]),
      ) as Record<ApplicationStatus, number>;
      for (const row of applicationRows ?? []) {
        const status = row.status as ApplicationStatus;
        pipelineCounts[status] = (pipelineCounts[status] ?? 0) + 1;
      }

      return {
        requisition,
        departmentName: (departmentRow?.name as string) ?? "—",
        locationName: (locationRow?.name as string) ?? "—",
        postingSlug:
          postingRow?.status === "PUBLISHED"
            ? (postingRow.slug as string)
            : undefined,
        candidateCount: (applicationRows ?? []).length,
        pipelineCounts,
      };
    },

    async createJobRequisition(input: CreateJobRequisitionInput) {
      const client = getSupabaseServiceClient();
      if (!client) {
        throw new Error("Supabase is not configured");
      }

      const now = new Date().toISOString();
      const requisitionId = `req-${crypto.randomUUID()}`;
      const requisitionNumber = `REQ-${new Date().getFullYear()}-${crypto
        .randomUUID()
        .slice(0, 4)
        .toUpperCase()}`;

      const { error: requisitionError } = await client.from("job_requisitions").insert({
        id: requisitionId,
        requisition_number: requisitionNumber,
        title: input.title,
        department_id: input.departmentId,
        position_id: input.positionId,
        location_id: input.locationId,
        hiring_manager_user_id: input.hiringManagerUserId,
        recruiter_user_id: input.recruiterUserId,
        employment_type: input.employmentType,
        workplace_type: input.workplaceType,
        career_area: input.careerArea,
        openings: input.openings,
        salary_min: input.salaryMin,
        salary_max: input.salaryMax,
        currency: "USD",
        description: input.description,
        responsibilities: input.responsibilities,
        qualifications: input.qualifications,
        preferred_qualifications: input.preferredQualifications,
        status: input.publishNow ? "PUBLISHED" : "DRAFT",
        created_at: now,
        updated_at: now,
      });
      if (requisitionError) {
        throw new Error(`Requisition insert failed (${requisitionError.code}): ${requisitionError.message}`);
      }

      let postingSlug: string | undefined;
      if (input.publishNow) {
        postingSlug = await insertPosting(client, {
          requisitionId,
          title: input.title,
          careerArea: input.careerArea,
          departmentName: input.departmentName,
          locationName: input.locationName,
          workplaceType: input.workplaceType,
          employmentType: input.employmentType,
          description: input.description,
          responsibilities: input.responsibilities,
          qualifications: input.qualifications,
          preferredQualifications: input.preferredQualifications,
          publishAt: input.publishAt,
          expiresAt: input.expiresAt,
        });
      }

      return { requisitionId, postingSlug };
    },

    async getPostingForRequisition(requisitionId: string) {
      const client = getSupabaseServiceClient();
      if (!client) return undefined;
      const { data, error } = await client.from("jobs").select("*").eq("requisition_id", requisitionId).maybeSingle();
      if (error) throw new Error(`posting lookup failed (${error.code})`);
      return data ? mapPosting(data) : undefined;
    },

    async updateJobDescription(requisitionId: string, input: JobDescriptionInput) {
      const client = getSupabaseServiceClient();
      if (!client) return undefined;
      const now = new Date().toISOString();
      const { data: updated, error } = await client
        .from("job_requisitions")
        .update({
          description: input.description,
          responsibilities: input.responsibilities,
          qualifications: input.qualifications,
          preferred_qualifications: input.preferredQualifications,
          updated_at: now,
        })
        .eq("id", requisitionId)
        .select("id");
      if (error) throw new Error(`requisition update failed (${error.code})`);
      if (!updated?.length) return undefined;

      // Same content on the posting, if one exists. Status and dates of
      // publication are untouched: publishing stays a separate step.
      const { data: posting, error: postingError } = await client
        .from("jobs")
        .update({
          summary: input.summary,
          description: input.description,
          responsibilities: input.responsibilities,
          qualifications: input.qualifications,
          preferred_qualifications: input.preferredQualifications,
          experience_level: input.experienceLevel || null,
          application_deadline: input.applicationDeadline || null,
          updated_at: now,
        })
        .eq("requisition_id", requisitionId)
        .select("id");
      if (postingError) throw new Error(`posting update failed (${postingError.code})`);
      return { postingUpdated: (posting ?? []).length > 0 };
    },

    async publishJobRequisition(requisitionId: string) {
      const client = getSupabaseServiceClient();
      if (!client) return undefined;

      const now = new Date().toISOString();

      const { data: requisitionRow } = await client
        .from("job_requisitions")
        .select("*")
        .eq("id", requisitionId)
        .maybeSingle();
      if (!requisitionRow) return undefined;

      await client
        .from("job_requisitions")
        .update({ status: "PUBLISHED", updated_at: now })
        .eq("id", requisitionId);

      const { data: existingPosting } = await client
        .from("jobs")
        .select("slug")
        .eq("requisition_id", requisitionId)
        .maybeSingle();

      if (existingPosting) {
        await client
          .from("jobs")
          .update({ status: "PUBLISHED", published_at: now, updated_at: now })
          .eq("requisition_id", requisitionId);
        return { postingSlug: existingPosting.slug as string };
      }

      const requisition = mapRequisition(requisitionRow);
      const [{ data: departmentRow }, { data: locationRow }] =
        await Promise.all([
          client
            .from("departments")
            .select("name")
            .eq("id", requisition.departmentId)
            .maybeSingle(),
          client
            .from("locations")
            .select("name")
            .eq("id", requisition.locationId)
            .maybeSingle(),
        ]);

      const postingSlug = await insertPosting(client, {
        requisitionId,
        title: requisition.title,
        careerArea: requisition.careerArea,
        departmentName: (departmentRow?.name as string) ?? "—",
        locationName: (locationRow?.name as string) ?? "—",
        workplaceType: requisition.workplaceType,
        employmentType: requisition.employmentType,
        description: requisition.description,
        responsibilities: requisition.responsibilities,
        qualifications: requisition.qualifications,
        preferredQualifications: requisition.preferredQualifications,
      });

      return { postingSlug };
    },

    async submitApplication(
      input: SubmitApplicationInput,
    ): Promise<SubmitApplicationResult> {
      const client = getSupabaseServiceClient();
      if (!client) {
        throw new Error("Supabase is not configured");
      }
      if (!input.resume && !input.libraryResumeDocumentId) {
        throw new Error("Easy Apply requires a resume");
      }
      const { submitEasyApplication } = await import("@/lib/recruiting/easy-apply");
      const { createSupabaseEasyApplyPorts } = await import(
        "@/lib/recruiting/easy-apply-supabase"
      );
      return submitEasyApplication(input, { ports: createSupabaseEasyApplyPorts(client) });
    },

    async updateApplicationStage(applicationId, status) {
      const client = getSupabaseServiceClient();
      if (!client) return;

      const { transitionApplicationStatus } = await import(
        "@/lib/recruiting/application-transitions"
      );

      await transitionApplicationStatus({
        applicationId,
        toStatus: status,
        allowIdempotentSameStatus: true,
      });
    },

    async createOffer(input) {
      const client = getSupabaseServiceClient();
      if (!client) {
        throw new Error("Supabase is not configured");
      }

      const now = new Date().toISOString();
      const offerId = `offer-${crypto.randomUUID()}`;
      const offerNumber = `OFFER-${new Date().getFullYear()}-${crypto
        .randomUUID()
        .slice(0, 4)
        .toUpperCase()}`;

      const { data, error } = await client
        .from("offers")
        .insert({
          id: offerId,
          application_id: input.applicationId,
          offer_number: offerNumber,
          status: "DRAFT",
          base_salary: input.baseSalary ?? null,
          hourly_rate: input.hourlyRate ?? null,
          currency: input.currency ?? "USD",
          employment_type: input.employmentType,
          workplace_type: input.workplaceType,
          start_date: input.startDate,
          expiration_date: input.expirationDate ?? null,
          terms_summary: input.termsSummary ?? null,
          created_at: now,
          updated_at: now,
        })
        .select("*")
        .single();
      if (error) throw new Error(`Failed to create offer: ${error.message}`);

      const { data: applicationRow } = await client
        .from("applications")
        .select("candidate_id, requisition_id")
        .eq("id", input.applicationId)
        .maybeSingle();

      await client.from("recruiting_activities").insert({
        id: `act-${crypto.randomUUID()}`,
        candidate_id: applicationRow?.candidate_id ?? null,
        application_id: input.applicationId,
        requisition_id: applicationRow?.requisition_id ?? null,
        activity_type: "OFFER_CREATED",
        summary: `Offer created: ${offerNumber}`,
        created_at: now,
      });

      // Ensure application is in OFFER when an offer is created.
      try {
        const { transitionApplicationStatus } = await import(
          "@/lib/recruiting/application-transitions"
        );
        await transitionApplicationStatus({
          applicationId: input.applicationId,
          toStatus: "OFFER",
          reason: "Offer created",
          allowIdempotentSameStatus: true,
        });
      } catch {
        // If current status cannot move to OFFER, leave as-is; recruiter can advance.
      }

      return mapOffer(data);
    },

    async updateOfferStatus(offerId, status) {
      const client = getSupabaseServiceClient();
      if (!client) return undefined;

      const { data: offerRow } = await client
        .from("offers")
        .select("*")
        .eq("id", offerId)
        .maybeSingle();
      if (!offerRow) return undefined;

      const previousStatus = offerRow.status as Offer["status"];
      const { canTransitionOffer } = await import(
        "@/lib/recruiting/status-machine"
      );
      if (!canTransitionOffer(previousStatus, status)) {
        throw new Error(
          `Invalid offer transition: ${previousStatus} → ${status}`,
        );
      }

      const now = new Date().toISOString();

      const { data, error } = await client
        .from("offers")
        .update({ status, updated_at: now })
        .eq("id", offerId)
        .select("*")
        .single();
      if (error) throw new Error(`Failed to update offer: ${error.message}`);

      const { data: applicationRow } = await client
        .from("applications")
        .select("candidate_id, requisition_id")
        .eq("id", offerRow.application_id)
        .maybeSingle();

      await client.from("recruiting_activities").insert({
        id: `act-${crypto.randomUUID()}`,
        candidate_id: applicationRow?.candidate_id ?? null,
        application_id: offerRow.application_id,
        requisition_id: applicationRow?.requisition_id ?? null,
        activity_type: "OFFER_STATUS_CHANGED",
        summary: `Offer ${offerRow.offer_number} status: ${previousStatus} → ${status}`,
        created_at: now,
      });

      return mapOffer(data);
    },

    async updateCandidateContactInfo(
      candidateId: string,
      input: UpdateCandidateContactInfoInput,
    ) {
      const client = getSupabaseServiceClient();
      if (!client) throw new Error("Supabase is not configured");

      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.firstName !== undefined) patch.first_name = input.firstName;
      if (input.lastName !== undefined) patch.last_name = input.lastName;
      if (input.preferredName !== undefined) patch.preferred_name = input.preferredName;
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.city !== undefined) patch.city = input.city;
      if (input.state !== undefined) patch.state = input.state;
      if (input.professionalSummary !== undefined) {
        patch.professional_summary = input.professionalSummary;
      }
      if (input.linkedinUrl !== undefined) patch.linkedin_url = input.linkedinUrl;
      if (input.portfolioUrl !== undefined) patch.portfolio_url = input.portfolioUrl;
      if (input.githubUrl !== undefined) patch.github_url = input.githubUrl;
      if (input.workAuthorization !== undefined) {
        patch.work_authorization = input.workAuthorization;
      }
      if (input.willingToRelocate !== undefined) {
        patch.willing_to_relocate = input.willingToRelocate;
      }

      const { data, error } = await client
        .from("candidate_profiles")
        .update(patch)
        .eq("id", candidateId)
        .select("*")
        .single();
      if (error) throw new Error(`Failed to update candidate: ${error.message}`);

      return mapCandidate(data);
    },
  };
}

async function insertPosting(
  client: NonNullable<ReturnType<typeof getSupabaseServiceClient>>,
  posting: {
    requisitionId: string;
    title: string;
    careerArea: string;
    departmentName: string;
    locationName: string;
    workplaceType: string;
    employmentType: string;
    description: string;
    responsibilities: string[];
    qualifications: string[];
    preferredQualifications: string[];
    publishAt?: string;
    expiresAt?: string;
  },
): Promise<string> {
  const now = new Date().toISOString();
  const scheduled =
    posting.publishAt != null && new Date(posting.publishAt).getTime() > Date.now();
  const baseSlug = slugify(posting.title);

  let slug = baseSlug;
  let suffix = 2;
  for (;;) {
    const { data: collision } = await client
      .from("jobs")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!collision) break;
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  await client.from("jobs").insert({
    id: `post-${posting.requisitionId}`,
    requisition_id: posting.requisitionId,
    slug,
    title: posting.title,
    summary: posting.description,
    description: posting.description,
    career_area: posting.careerArea,
    department_name: posting.departmentName,
    location_name: posting.locationName,
    workplace_type: posting.workplaceType,
    employment_type: posting.employmentType,
    responsibilities: posting.responsibilities,
    qualifications: posting.qualifications,
    preferred_qualifications: posting.preferredQualifications,
    status: scheduled ? "SCHEDULED" : "PUBLISHED",
    published_at: scheduled ? null : now,
    publish_at: posting.publishAt ?? null,
    expires_at: posting.expiresAt ?? null,
    is_demo: false,
    created_at: now,
    updated_at: now,
  });

  return slug;
}
