import "server-only";

import { getSupabaseServiceClient } from "@/app/lib/supabase/server";
import { getOpenJobs } from "@/lib/jobs";
import { recruitingRepository } from "@/lib/recruiting";
import {
  analyzeCandidateForJob,
  rankCandidates,
  requirementsFromJob,
  type JobAnalysis,
  type JobRequirements,
} from "@/lib/recruiting/job-analyzer";
import { getResumeProfileStore } from "@/lib/recruiting/resume-profiles-server";
import type { ResumeProfile } from "@/lib/recruiting/resume-profiles";

/**
 * Bidirectional matching. READ-ONLY by design: nothing here writes to
 * applications, statuses, interviews or offers. Results are recruiter
 * decision support; callers must be authorized recruiting staff.
 */

const evidenceOf = (profile: ResumeProfile | null) => ({
  parsed: profile?.status === "PARSED" ? profile.structured : null,
  resumeText: profile?.status === "PARSED" ? profile.extractedText : null,
});

export async function requirementsForRequisition(requisitionId: string): Promise<JobRequirements | null> {
  const detail = await recruitingRepository.getJobDetail(requisitionId);
  if (!detail) return null;
  const r = detail.requisition;
  return requirementsFromJob({
    title: r.title,
    description: r.description,
    responsibilities: r.responsibilities,
    qualifications: r.qualifications,
    preferredQualifications: r.preferredQualifications,
  });
}

export type CandidateMatchRow = {
  candidateId: string;
  candidateName: string;
  currentTitle: string | null;
  resumeDocumentId: string;
  analysis: JobAnalysis;
};

/** Job → existing candidates (stored, parsed resumes only). */
export async function findCandidatesForRequisition(
  requisitionId: string,
  limit = 25,
): Promise<{ requirements: JobRequirements; matches: CandidateMatchRow[]; evaluated: number } | null> {
  const requirements = await requirementsForRequisition(requisitionId);
  if (!requirements) return null;
  const profiles = await getResumeProfileStore().latestParsedPerCandidate(1000);
  const names = await candidateNames(profiles.map((p) => p.candidateId));
  const ranked = rankCandidates(
    requirements,
    profiles.map((p) => ({ candidate: p, evidence: evidenceOf(p) })),
    limit,
  );
  return {
    requirements,
    evaluated: profiles.length,
    matches: ranked.map(({ candidate, analysis }) => ({
      candidateId: candidate.candidateId,
      candidateName: names.get(candidate.candidateId) ?? candidate.structured?.contact.name ?? "Candidate",
      currentTitle: candidate.structured?.titles[0] ?? null,
      resumeDocumentId: candidate.documentId,
      analysis,
    })),
  };
}

export type JobMatchRow = { slug: string; title: string; location: string; requisitionId: string; analysis: JobAnalysis };

/** Candidate → current eligible public jobs (same eligibility as /jobs). */
export async function findJobsForCandidate(candidateId: string, limit = 10): Promise<{ profile: ResumeProfile | null; matches: JobMatchRow[] }> {
  const profile = await getResumeProfileStore().latestForCandidate(candidateId);
  const evidence = evidenceOf(profile);
  if (!evidence.parsed) return { profile, matches: [] };
  const jobs = await getOpenJobs();
  const analyzed = await Promise.all(
    jobs.map(async (job) => {
      // Same requirement source as Job → candidates (the requisition), so a
      // pair scores identically from either side. Posting text is the fallback.
      const requirements =
        (job.requisitionId ? await requirementsForRequisition(job.requisitionId) : null) ??
        requirementsFromJob({
          title: job.title,
          description: job.description,
          responsibilities: job.responsibilities,
          qualifications: job.qualifications,
          preferredQualifications: job.preferredQualifications,
          skills: job.skills,
        });
      return {
        slug: job.slug,
        title: job.title,
        location: job.location,
        requisitionId: job.requisitionId,
        analysis: analyzeCandidateForJob(evidence, requirements),
      };
    }),
  );
  const matches = analyzed
    .filter((m) => m.analysis.score !== null && m.analysis.score > 0)
    .sort((a, b) => (b.analysis.score ?? 0) - (a.analysis.score ?? 0))
    .slice(0, limit);
  return { profile, matches };
}

/** One application vs. its own requisition, using the resume submitted with it. */
export async function analyzeApplication(input: {
  candidateId: string;
  requisitionId: string;
  resumeDocumentId?: string | null;
  confirmedSkills?: string[];
}): Promise<{ analysis: JobAnalysis; profile: ResumeProfile | null } | null> {
  const requirements = await requirementsForRequisition(input.requisitionId);
  if (!requirements) return null;
  const store = getResumeProfileStore();
  const profile =
    (input.resumeDocumentId ? await store.getByDocument(input.resumeDocumentId) : null) ??
    (await store.latestForCandidate(input.candidateId));
  return {
    profile,
    analysis: analyzeCandidateForJob({ ...evidenceOf(profile), confirmedSkills: input.confirmedSkills }, requirements),
  };
}

async function candidateNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const client = getSupabaseServiceClient();
  if (client) {
    const { data } = await client.from("candidate_profiles").select("id, first_name, last_name").in("id", ids.slice(0, 1000));
    for (const row of data ?? []) map.set(row.id as string, `${row.first_name} ${row.last_name}`.trim());
    return map;
  }
  for (const c of await recruitingRepository.listCandidateSummaries()) map.set(c.candidateId, c.name);
  return map;
}
