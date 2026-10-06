import type { Metadata } from "next";

import { JobsPortal } from "@/components/jobs/JobsPortal";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import {
  getOpenJobs,
  parsePortalSearch,
  searchPublicJobs,
} from "@/lib/jobs";
import { assertProductionSupabaseConfigured } from "@/app/lib/supabase/server";

export const metadata: Metadata = {
  title: "Jobs",
  description: "Open roles at Consult America and partner employers.",
};

export const dynamic = "force-dynamic";

type JobsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;
  const search = parsePortalSearch(params);

  let jobs: Awaited<ReturnType<typeof searchPublicJobs>>["jobs"] = [];
  let total = 0;
  let availableCategoryIds: string[] = [];
  let error: string | undefined;

  try {
    assertProductionSupabaseConfigured();
    const [result, openJobs] = await Promise.all([
      searchPublicJobs(search),
      getOpenJobs(),
    ]);
    jobs = result.jobs;
    total = result.total;
    availableCategoryIds = [
      ...new Set(openJobs.flatMap((job) => job.categories.map((category) => category.id))),
    ];
  } catch (err) {
    error =
      err instanceof Error && err.message
        ? err.message
        : "Unable to load openings right now.";
    jobs = [];
    total = 0;
  }

  return (
    <>
      <MarketingHeader solid={false} />
      <main>
        <JobsPortal
          key={[search.q, search.location, search.category, search.sort, search.page].join("|")}
          jobs={jobs}
          total={total}
          search={search}
          availableCategoryIds={availableCategoryIds}
          error={error}
        />
      </main>
      <MarketingFooter />
    </>
  );
}
