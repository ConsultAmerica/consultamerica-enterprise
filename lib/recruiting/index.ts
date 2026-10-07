import "server-only";

import { isSupabaseConfigured } from "@/app/lib/supabase/server";
import { stagingPortalJobs } from "@/data/recruiting/staging-portal-jobs";
import {
  seedApplications,
  seedCandidates,
  seedDepartments,
  seedLocations,
  seedPostings,
  seedRequisitions,
} from "@/data/recruiting/seed";
import { createSupabaseRecruitingRepository } from "@/lib/recruiting/supabase-repository";
import { isPubliclyOpen } from "@/lib/jobs/eligibility";
import {
  assertApplicationTransition,
  canTransitionOffer,
} from "@/lib/recruiting/status-machine";
import type {
  ApplicationQueueItem,
  CandidateListItem,
  CandidateProfileDetail,
  CreateJobRequisitionInput,
  JobDetail,
  JobListItem,
  RecruitingApplicationQueueReads,
  RecruitingApplicationWrites,
  RecruitingCandidateReads,
  RecruitingDashboardReads,
  RecruitingJobReads,
  RecruitingJobWrites,
  RecruitingCandidateSelfWrites,
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
  type ApplicationStatusHistory,
  type CandidateProfile,
  type Job,
  type JobRequisition,
  type Offer,
  type RecruitingActivity,
} from "@/types/recruiting";
import { JobClosedError } from "@/lib/recruiting/errors";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * In-memory recruiting repository. Fully functional (including writes) so
 * the whole requisition -> publish -> apply -> ATS loop can be exercised
 * locally without a Supabase project - not just a read-only stub.
 */
export function createMemoryRecruitingRepository(): RecruitingRepository &
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
  const postings = [
    ...seedPostings,
    ...(process.env.NODE_ENV === "production" ? [] : stagingPortalJobs()),
  ];
  const requisitions = [...seedRequisitions];
  const candidates: CandidateProfile[] = [...seedCandidates];
  const applications: Application[] = [...seedApplications];
  const offers: Offer[] = [];
  const activities: RecruitingActivity[] = [];
  const statusHistory: ApplicationStatusHistory[] = [];

  function departmentName(departmentId: string): string {
    return (
      seedDepartments.find((d) => d.id === departmentId)?.name ?? "—"
    );
  }

  function locationName(locationId: string): string {
    return seedLocations.find((l) => l.id === locationId)?.name ?? "—";
  }

  function candidateCountFor(requisitionId: string): number {
    return applications.filter((a) => a.requisitionId === requisitionId)
      .length;
  }

  return {
    async listPublishedPostings() {
      return postings
        .filter((posting) => isPubliclyOpen(posting))
        .sort((a, b) => {
          const aDate = a.publishedAt ?? a.createdAt;
          const bDate = b.publishedAt ?? b.createdAt;
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        });
    },

    async getPostingBySlug(slug: string) {
      return postings.find(
        (posting) => posting.slug === slug && isPubliclyOpen(posting),
      );
    },

    async getPostingBySlugAny(slug: string) {
      return postings.find(
        (posting) => posting.slug === slug && posting.status !== "DRAFT",
      );
    },

    async getRequisitionById(id: string) {
      return requisitions.find((requisition) => requisition.id === id);
    },

    async getCandidateByEmail(email: string) {
      const normalized = email.trim().toLowerCase();
      return candidates.find(
        (candidate) => candidate.email.toLowerCase() === normalized,
      );
    },

    async listLatestMatchScoresForPairs() {
      // Candidate Match results are only persisted to Supabase (jd_analysis);
      // the in-memory/demo repository never writes them, so there is nothing
      // to read back here.
      return [];
    },

    async listApplicationsByRequisition(requisitionId: string) {
      return applications.filter(
        (application) => application.requisitionId === requisitionId,
      );
    },

    async getApplicationById(applicationId: string) {
      return applications.find((application) => application.id === applicationId);
    },

    async getOfferByApplicationId(applicationId: string) {
      return offers.find((offer) => offer.applicationId === applicationId);
    },

    async countCandidates() {
      return candidates.length;
    },

    async countOpenRequisitions() {
      return requisitions.filter((r) =>
        ["APPROVED", "PUBLISHED"].includes(r.status),
      ).length;
    },

    async getApplicationPipelineCounts() {
      const counts = Object.fromEntries(
        [...APPLICATION_PIPELINE, ...APPLICATION_TERMINAL_STATUSES].map(
          (status) => [status, 0],
        ),
      ) as Record<ApplicationStatus, number>;

      for (const application of applications) {
        counts[application.status] = (counts[application.status] ?? 0) + 1;
      }

      return counts;
    },

    async listUpcomingInterviews() {
      return [];
    },

    async listRecentHires(limit: number) {
      return applications
        .filter((a) => a.status === "HIRED")
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, limit);
    },

    async listCandidateSummaries(): Promise<CandidateListItem[]> {
      const latestByCandidate = new Map<string, Application>();
      for (const application of applications) {
        const existing = latestByCandidate.get(application.candidateId);
        if (
          !existing ||
          new Date(application.appliedAt) > new Date(existing.appliedAt)
        ) {
          latestByCandidate.set(application.candidateId, application);
        }
      }

      return candidates.map((candidate) => {
        const application = latestByCandidate.get(candidate.id);
        const posting = application
          ? postings.find((p) => p.id === application.jobId)
          : undefined;

        return {
          candidateId: candidate.id,
          name: `${candidate.firstName} ${candidate.lastName}`,
          email: candidate.email,
          role: posting?.title ?? "—",
          requisitionId: application?.requisitionId,
          applicationNumber: application?.applicationNumber ?? "—",
          stage: application?.status,
          location: posting?.locationName ?? "—",
          source: candidate.source,
          workAuthorization: candidate.workAuthorization,
          appliedAt: application?.appliedAt,
          lastActivityAt: application?.updatedAt ?? candidate.updatedAt,
          skills: [],
        };
      });
    },

    async listApplicationsQueue(): Promise<ApplicationQueueItem[]> {
      return applications
        .map((application): ApplicationQueueItem => {
          const candidate = candidates.find((c) => c.id === application.candidateId);
          const posting = postings.find((p) => p.id === application.jobId);
          const requisition = requisitions.find((r) => r.id === application.requisitionId);
          const lastActivity = activities
            .filter((a) => a.applicationId === application.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

          return {
            applicationId: application.id,
            applicationNumber: application.applicationNumber,
            candidateId: application.candidateId,
            candidateName: candidate ? `${candidate.firstName} ${candidate.lastName}` : "—",
            candidateEmail: candidate?.email ?? "—",
            jobTitle: posting?.title ?? requisition?.title ?? "—",
            requisitionId: application.requisitionId,
            departmentName: requisition ? departmentName(requisition.departmentId) : "—",
            locationName: posting?.locationName ?? (requisition ? locationName(requisition.locationId) : "—"),
            appliedAt: application.appliedAt,
            status: application.status,
            // Recruiter/hiring-manager identity resolution needs the
            // `profiles` table, which has no memory-mode seed — left
            // unassigned here; the Supabase repository resolves real names.
            recruiterUserId: requisition?.recruiterUserId,
            recruiterName: undefined,
            hiringManagerUserId: requisition?.hiringManagerUserId,
            hiringManagerName: undefined,
            lastActivityAt: lastActivity?.createdAt ?? application.updatedAt,
            skills: [],
          };
        })
        .sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime());
    },

    async getCandidateProfile(
      candidateId: string,
    ): Promise<CandidateProfileDetail | undefined> {
      const candidate = candidates.find((c) => c.id === candidateId);
      if (!candidate) return undefined;

      const candidateApplications = applications.filter(
        (a) => a.candidateId === candidateId,
      );

      return {
        candidate,
        applications: candidateApplications.map((application) => {
          const requisition = requisitions.find(
            (r) => r.id === application.requisitionId,
          );
          const posting = postings.find(
            (p) => p.id === application.jobId,
          );
          return {
            applicationId: application.id,
            applicationNumber: application.applicationNumber,
            requisitionId: application.requisitionId,
            requisitionTitle: requisition?.title ?? posting?.title ?? "—",
            requisitionNumber: requisition?.requisitionNumber ?? "—",
            postingLocation: posting?.locationName ?? "—",
            status: application.status,
            appliedAt: application.appliedAt,
            updatedAt: application.updatedAt,
          };
        }),
        experience:
          candidateId === "cand-demo-001"
            ? [
                {
                  id: "exp-demo-001",
                  candidateId,
                  title: "Oracle Financials Consultant",
                  company: "Enterprise Systems Partners",
                  startDate: "2019-03-01",
                  endDate: "2026-06-01",
                  isCurrent: false,
                  description:
                    "Led Fusion GL/AP configuration, month-end close redesign, and UAT for multi-entity rollouts. Partnered with finance stakeholders on chart of accounts and reporting.",
                },
              ]
            : [],
        education:
          candidateId === "cand-demo-001"
            ? [
                {
                  id: "edu-demo-001",
                  candidateId,
                  institution: "University of Texas",
                  degree: "BBA",
                  fieldOfStudy: "Information Systems",
                  startDate: "2011-08-01",
                  endDate: "2015-05-01",
                },
              ]
            : [],
        skills:
          candidateId === "cand-demo-001"
            ? [
                { id: "sk-demo-1", candidateId, skillId: "skill-oracle", skill: "Oracle Fusion", proficiency: "Expert" },
                { id: "sk-demo-2", candidateId, skillId: "skill-fin", skill: "Financials", proficiency: "Expert" },
                { id: "sk-demo-3", candidateId, skillId: "skill-gl", skill: "GL", proficiency: "Advanced" },
                { id: "sk-demo-4", candidateId, skillId: "skill-ap", skill: "AP", proficiency: "Advanced" },
                { id: "sk-demo-5", candidateId, skillId: "skill-sql", skill: "SQL", proficiency: "Intermediate" },
              ]
            : [],
        documents:
          candidateId === "cand-demo-001"
            ? [
                {
                  id: "doc-demo-resume-001",
                  candidateId,
                  documentType: "RESUME" as const,
                  fileName: "Priya_Shah_Resume.pdf",
                  storagePath: "demo/priya-shah-resume.pdf",
                  mimeType: "application/pdf",
                  fileSize: 120000,
                  isPrimaryResume: true,
                  status: "ACTIVE" as const,
                  uploadedAt: "2026-08-20T15:00:00.000Z",
                },
              ]
            : [],
        statusHistory: statusHistory
          .filter((h) =>
            candidateApplications.some((a) => a.id === h.applicationId),
          )
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        interviews: [],
        feedback: [],
        activities: activities
          .filter((a) => a.candidateId === candidateId)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
      };
    },

    async listJobSummaries(): Promise<JobListItem[]> {
      return requisitions
        .map((requisition) => ({
          requisitionId: requisition.id,
          requisitionNumber: requisition.requisitionNumber,
          title: requisition.title,
          departmentName: departmentName(requisition.departmentId),
          locationName: locationName(requisition.locationId),
          workplaceType: requisition.workplaceType,
          employmentType: requisition.employmentType,
          status: requisition.status,
          candidateCount: candidateCountFor(requisition.id),
          updatedAt: requisition.updatedAt,
        }))
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
    },

    async getJobDetail(requisitionId: string): Promise<JobDetail | undefined> {
      const requisition = requisitions.find((r) => r.id === requisitionId);
      if (!requisition) return undefined;

      const posting = postings.find(
        (p) => p.requisitionId === requisitionId,
      );

      const pipelineCounts = Object.fromEntries(
        [...APPLICATION_PIPELINE, ...APPLICATION_TERMINAL_STATUSES].map(
          (status) => [status, 0],
        ),
      ) as Record<ApplicationStatus, number>;

      for (const application of applications) {
        if (application.requisitionId !== requisitionId) continue;
        pipelineCounts[application.status] =
          (pipelineCounts[application.status] ?? 0) + 1;
      }

      return {
        requisition,
        departmentName: departmentName(requisition.departmentId),
        locationName: locationName(requisition.locationId),
        postingSlug: posting?.status === "PUBLISHED" ? posting.slug : undefined,
        candidateCount: candidateCountFor(requisitionId),
        pipelineCounts,
      };
    },

    async createJobRequisition(input: CreateJobRequisitionInput) {
      const now = new Date().toISOString();
      const requisitionId = `req-${crypto.randomUUID()}`;
      const requisitionNumber = `REQ-${new Date().getFullYear()}-${String(
        requisitions.length + 1,
      ).padStart(4, "0")}`;

      const requisition: JobRequisition = {
        id: requisitionId,
        requisitionNumber,
        title: input.title,
        departmentId: input.departmentId,
        positionId: input.positionId,
        locationId: input.locationId,
        hiringManagerUserId: input.hiringManagerUserId,
        recruiterUserId: input.recruiterUserId,
        employmentType: input.employmentType,
        workplaceType: input.workplaceType,
        careerArea: input.careerArea,
        openings: input.openings,
        salaryMin: input.salaryMin,
        salaryMax: input.salaryMax,
        currency: "USD",
        description: input.description,
        responsibilities: input.responsibilities,
        qualifications: input.qualifications,
        preferredQualifications: input.preferredQualifications,
        status: input.publishNow ? "PUBLISHED" : "DRAFT",
        createdAt: now,
        updatedAt: now,
      };
      requisitions.push(requisition);

      let postingSlug: string | undefined;
      if (input.publishNow) {
        postingSlug = createPostingFor(requisition, input);
      }

      return { requisitionId, postingSlug };
    },

    async publishJobRequisition(requisitionId: string) {
      const requisition = requisitions.find((r) => r.id === requisitionId);
      if (!requisition) return undefined;

      requisition.status = "PUBLISHED";
      requisition.updatedAt = new Date().toISOString();

      const existingPosting = postings.find(
        (p) => p.requisitionId === requisitionId,
      );
      if (existingPosting) {
        existingPosting.status = "PUBLISHED";
        existingPosting.publishedAt = requisition.updatedAt;
        existingPosting.updatedAt = requisition.updatedAt;
        return { postingSlug: existingPosting.slug };
      }

      const postingSlug = createPostingFor(requisition, {
        departmentName: departmentName(requisition.departmentId),
        locationName: locationName(requisition.locationId),
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
      const posting = postings.find((item) => item.id === input.postingId);
      if (!posting || !isPubliclyOpen(posting)) {
        throw new JobClosedError();
      }
      const now = new Date().toISOString();
      const normalizedEmail = input.email.trim().toLowerCase();

      let candidate = candidates.find(
        (c) => c.email.toLowerCase() === normalizedEmail,
      );
      if (!candidate) {
        candidate = {
          id: `cand-${crypto.randomUUID()}`,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          linkedinUrl: input.linkedinUrl,
          portfolioUrl: input.portfolioUrl,
          workAuthorization: input.workAuthorization,
          willingToRelocate: input.willingToRelocate,
          source: input.source,
          createdAt: now,
          updatedAt: now,
        };
        candidates.push(candidate);
      }

      const existingApplication = applications.find(
        (a) =>
          a.candidateId === candidate!.id &&
          a.requisitionId === input.requisitionId,
      );
      if (existingApplication) {
        return {
          candidateId: candidate.id,
          applicationId: existingApplication.id,
          applicationNumber: existingApplication.applicationNumber,
        };
      }

      const applicationId = `app-${crypto.randomUUID()}`;
      const applicationNumber = `APP-${new Date().getFullYear()}-${String(
        applications.length + 1,
      ).padStart(4, "0")}`;

      const application: Application = {
        id: applicationId,
        applicationNumber,
        candidateId: candidate.id,
        requisitionId: input.requisitionId,
        jobId: input.postingId,
        status: "APPLIED",
        coverLetter: input.coverLetter,
        additionalInformation: input.additionalInformation,
        appliedAt: now,
        updatedAt: now,
      };
      applications.push(application);

      activities.push({
        id: `act-${crypto.randomUUID()}`,
        candidateId: candidate.id,
        applicationId,
        requisitionId: input.requisitionId,
        activityType: "APPLICATION_SUBMITTED",
        summary: "Application submitted",
        createdAt: now,
      });

      statusHistory.push({
        id: `hist-${crypto.randomUUID()}`,
        applicationId,
        toStatus: "APPLIED",
        note: "Application submitted",
        createdAt: now,
      });

      return {
        candidateId: candidate.id,
        applicationId,
        applicationNumber,
      };
    },

    async updateApplicationStage(applicationId, status) {
      const application = applications.find((a) => a.id === applicationId);
      if (!application) return;

      const previousStatus = application.status;
      if (previousStatus === status) return;

      assertApplicationTransition(previousStatus, status);

      const now = new Date().toISOString();
      application.status = status;
      application.updatedAt = now;

      statusHistory.push({
        id: `hist-${crypto.randomUUID()}`,
        applicationId: application.id,
        fromStatus: previousStatus,
        toStatus: status,
        note: undefined,
        createdAt: now,
      });

      activities.push({
        id: `act-${crypto.randomUUID()}`,
        candidateId: application.candidateId,
        applicationId: application.id,
        requisitionId: application.requisitionId,
        activityType: "STAGE_CHANGED",
        summary: `Stage changed: ${previousStatus} → ${status}`,
        createdAt: now,
      });
    },

    async createOffer(input) {
      const now = new Date().toISOString();
      const application = applications.find((a) => a.id === input.applicationId);

      const offer: Offer = {
        id: `offer-${crypto.randomUUID()}`,
        applicationId: input.applicationId,
        offerNumber: `OFFER-${new Date().getFullYear()}-${String(
          offers.length + 1,
        ).padStart(4, "0")}`,
        status: "DRAFT",
        baseSalary: input.baseSalary,
        hourlyRate: input.hourlyRate,
        currency: input.currency ?? "USD",
        employmentType: input.employmentType,
        workplaceType: input.workplaceType,
        startDate: input.startDate,
        expirationDate: input.expirationDate,
        termsSummary: input.termsSummary,
        createdAt: now,
        updatedAt: now,
      };
      offers.push(offer);

      activities.push({
        id: `act-${crypto.randomUUID()}`,
        candidateId: application?.candidateId,
        applicationId: input.applicationId,
        requisitionId: application?.requisitionId,
        activityType: "OFFER_CREATED",
        summary: `Offer created: ${offer.offerNumber}`,
        createdAt: now,
      });

      if (application && application.status !== "OFFER") {
        try {
          assertApplicationTransition(application.status, "OFFER");
          const previous = application.status;
          application.status = "OFFER";
          application.updatedAt = now;
          statusHistory.push({
            id: `hist-${crypto.randomUUID()}`,
            applicationId: application.id,
            fromStatus: previous,
            toStatus: "OFFER",
            note: "Offer created",
            createdAt: now,
          });
        } catch {
          // Leave application status if transition is invalid.
        }
      }

      return offer;
    },

    async updateOfferStatus(offerId, status) {
      const offer = offers.find((o) => o.id === offerId);
      if (!offer) return undefined;

      const previous = offer.status;
      if (!canTransitionOffer(previous, status)) {
        throw new Error(`Invalid offer transition: ${previous} → ${status}`);
      }

      const now = new Date().toISOString();
      offer.status = status;
      offer.updatedAt = now;

      const application = applications.find((a) => a.id === offer.applicationId);
      activities.push({
        id: `act-${crypto.randomUUID()}`,
        candidateId: application?.candidateId,
        applicationId: offer.applicationId,
        requisitionId: application?.requisitionId,
        activityType: "OFFER_STATUS_CHANGED",
        summary: `Offer ${offer.offerNumber} status: ${previous} → ${status}`,
        createdAt: now,
      });

      return offer;
    },

    async updateCandidateContactInfo(
      candidateId: string,
      input: UpdateCandidateContactInfoInput,
    ) {
      const candidate = candidates.find((c) => c.id === candidateId);
      if (!candidate) throw new Error("Candidate not found");

      if (input.firstName !== undefined) candidate.firstName = input.firstName;
      if (input.lastName !== undefined) candidate.lastName = input.lastName;
      if (input.preferredName !== undefined) candidate.preferredName = input.preferredName;
      if (input.phone !== undefined) candidate.phone = input.phone;
      if (input.city !== undefined) candidate.city = input.city;
      if (input.state !== undefined) candidate.state = input.state;
      if (input.professionalSummary !== undefined) {
        candidate.professionalSummary = input.professionalSummary;
      }
      if (input.linkedinUrl !== undefined) candidate.linkedinUrl = input.linkedinUrl;
      if (input.portfolioUrl !== undefined) candidate.portfolioUrl = input.portfolioUrl;
      if (input.githubUrl !== undefined) candidate.githubUrl = input.githubUrl;
      if (input.workAuthorization !== undefined) {
        candidate.workAuthorization = input.workAuthorization;
      }
      if (input.willingToRelocate !== undefined) {
        candidate.willingToRelocate = input.willingToRelocate;
      }
      candidate.updatedAt = new Date().toISOString();

      return candidate;
    },
  };

  function createPostingFor(
    requisition: JobRequisition,
    content: {
      departmentName: string;
      locationName: string;
      description: string;
      responsibilities: string[];
      qualifications: string[];
      preferredQualifications: string[];
      publishAt?: string;
      expiresAt?: string;
    },
  ): string {
    const now = new Date().toISOString();
    const scheduled =
      content.publishAt != null && new Date(content.publishAt).getTime() > Date.now();
    const baseSlug = slugify(requisition.title);
    let slug = baseSlug;
    let suffix = 2;
    while (postings.some((p) => p.slug === slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const posting: Job = {
      id: `post-${requisition.id}`,
      requisitionId: requisition.id,
      slug,
      title: requisition.title,
      summary: content.description,
      description: content.description,
      careerArea: requisition.careerArea,
      departmentName: content.departmentName,
      locationName: content.locationName,
      workplaceType: requisition.workplaceType,
      employmentType: requisition.employmentType,
      responsibilities: content.responsibilities,
      qualifications: content.qualifications,
      preferredQualifications: content.preferredQualifications,
      status: scheduled ? "SCHEDULED" : "PUBLISHED",
      publishedAt: scheduled ? undefined : now,
      publishAt: content.publishAt,
      expiresAt: content.expiresAt,
      isDemo: false,
      createdAt: now,
      updatedAt: now,
    };
    postings.push(posting);
    return slug;
  }
}

export const recruitingRepository: RecruitingRepository &
  RecruitingDashboardReads &
  RecruitingCandidateReads &
  RecruitingCandidateSelfWrites &
  RecruitingJobReads &
  RecruitingJobWrites &
  RecruitingApplicationWrites &
  RecruitingPipelineWrites &
  RecruitingOfferWrites &
  RecruitingApplicationQueueReads &
  RecruitingMatchScoreReads = isSupabaseConfigured()
  ? createSupabaseRecruitingRepository()
  : (() => {
      // Build/dev may use in-memory. Runtime production requests must call
      // assertProductionSupabaseConfigured() before reading public jobs.
      if (
        process.env.NODE_ENV === "production" &&
        process.env.VERCEL_ENV === "production" &&
        process.env.ALLOW_MEMORY_RECRUITING !== "1"
      ) {
        console.error(
          "[recruiting] Supabase unset in production — public jobs routes must fail closed via assertProductionSupabaseConfigured().",
        );
      }
      return createMemoryRecruitingRepository();
    })();

export async function listPublishedPostings(): Promise<Job[]> {
  return recruitingRepository.listPublishedPostings();
}

export async function getPostingBySlug(
  slug: string,
): Promise<Job | undefined> {
  return recruitingRepository.getPostingBySlug(slug);
}

export async function getPostingBySlugAny(
  slug: string,
): Promise<Job | undefined> {
  return recruitingRepository.getPostingBySlugAny(slug);
}

export async function getRequisitionById(
  id: string,
): Promise<JobRequisition | undefined> {
  return recruitingRepository.getRequisitionById(id);
}
