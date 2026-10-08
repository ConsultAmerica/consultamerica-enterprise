import "server-only";

import { getSupabaseServiceClient } from "@/app/lib/supabase/server";
import { DEMO_CANDIDATES } from "@/lib/candidate-portal/session";
import { createMemoryCandidatePortalStore, type MemoryCandidatePortalStore } from "@/lib/candidate-portal/store-memory";
import { createSupabaseCandidatePortalStore } from "@/lib/candidate-portal/store-supabase";
import type { CandidatePortalStore } from "@/lib/candidate-portal/types";
import { getOpenJobs } from "@/lib/jobs";
import { getResumeProfileStore } from "@/lib/recruiting/resume-profiles-server";

const globalForDemo = globalThis as typeof globalThis & { __caCandidatePortalDemo?: MemoryCandidatePortalStore };

/** Supabase in every connected environment; an in-memory store only in local demo mode. */
export function getCandidatePortalStore(): CandidatePortalStore {
  const client = getSupabaseServiceClient();
  if (client) return createSupabaseCandidatePortalStore(client);
  if (process.env.NODE_ENV === "production") throw new Error("Candidate portal requires Supabase in production.");
  return getDemoCandidatePortalStore();
}

/** Local demo only. Survives dev-server hot reloads. */
export function getDemoCandidatePortalStore(): MemoryCandidatePortalStore {
  if (globalForDemo.__caCandidatePortalDemo) return globalForDemo.__caCandidatePortalDemo;
  const store = createMemoryCandidatePortalStore({
    resumeProfiles: getResumeProfileStore(),
    lookupJob: async (requisitionId) => {
      const job = (await getOpenJobs()).find((j) => (j.requisitionId || j.id) === requisitionId);
      return job
        ? { slug: job.slug, title: job.title, location: job.location, company: job.company, acceptingApplications: job.acceptingApplications }
        : null;
    },
  });
  for (const demo of Object.values(DEMO_CANDIDATES)) {
    const [firstName, lastName] = demo.displayName.split(" ");
    store.seedProfile({
      candidateId: demo.candidateId,
      firstName,
      lastName,
      email: demo.email,
      phone: "",
      city: "",
      state: "",
      linkedinUrl: "",
      portfolioUrl: "",
      githubUrl: "",
      professionalSummary: "",
      workAuthorization: "",
    });
  }
  globalForDemo.__caCandidatePortalDemo = store;
  return store;
}
