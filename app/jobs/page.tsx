import type { Metadata } from "next";

import { JobsPortal } from "@/components/jobs/JobsPortal";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
// Job data now comes from Neon (see below). These two are pure URL-parameter
// helpers that happen to live in the Supabase-backed module; nothing they touch
// reads a database.
import { JOBS_PAGE_SIZE, parsePortalSearch } from "@/lib/jobs";
import { queryPortalJobs, type PortalSearch } from "@/lib/jobs/portal";
import type { Job } from "@/lib/jobs/public-model";
import { listPublicJobs } from "@/lib/neon/public-jobs";
import { logServerError } from "@/lib/observability/logger";

export const metadata: Metadata = {
  title: "Jobs",
  description: "Open roles at Consult America and partner employers.",
};

export const dynamic = "force-dynamic";

/**
 * Shown when the roles cannot be read at all. Neutral on purpose: the error
 * that caused it (NeonConfigError names environment variables, a driver error
 * carries a host) is not something to put in front of a candidate.
 */
const UNAVAILABLE_MESSAGE = "Open roles are unavailable right now. Please try again shortly.";

type JobsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * "all" means "no filter" in the markup, but queryPortalJobs compares it as a
 * value, so `?arrangement=all` would match nothing. searchPublicJobs used to
 * strip it on the way through; that step moves here now that the page builds
 * the query itself. The selects never emit "all" for these two, so this only
 * covers hand-written and bookmarked URLs.
 */
function withoutAllFilters(search: PortalSearch): PortalSearch {
  const unset = (value: string | undefined) => (value && value !== "all" ? value : undefined);
  return {
    ...search,
    employment: unset(search.employment),
    arrangement: unset(search.arrangement),
  };
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;
  const search = parsePortalSearch(params);

  let jobs: Job[] = [];
  let total = 0;
  let availableCategoryIds: string[] = [];
  let error: string | undefined;

  try {
    // Filtering, sorting and paging stay in queryPortalJobs: it is the same
    // code that produced these results from Supabase, so the facets and the
    // ordering a visitor sees do not change with the source. The published set
    // is small enough that one read plus in-memory filtering beats pushing
    // fifteen optional predicates into SQL.
    const all = await listPublicJobs();
    const result = queryPortalJobs(all, withoutAllFilters(search), new Date(), JOBS_PAGE_SIZE);
    jobs = result.jobs as Job[];
    total = result.total;
    // Category chips describe the whole open catalog, not the current page, so
    // the sidebar does not shrink as the visitor narrows a filter.
    availableCategoryIds = [
      ...new Set(
        all
          .filter((job) => job.acceptingApplications)
          .flatMap((job) => job.categories.map((category) => category.id)),
      ),
    ];
  } catch (err) {
    logServerError("jobs.listPublicJobs", err, { search: JSON.stringify(search) });
    error = UNAVAILABLE_MESSAGE;
    jobs = [];
    total = 0;
  }

  return (
    <>
      <MarketingHeader solid={false} assistantContext={{ page: "jobs" }} />
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
