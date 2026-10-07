"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import { JobDetailView } from "@/components/jobs/JobDetailView";
import {
  formatPostedDate,
  type Job,
} from "@/lib/jobs/public-model";
import {
  DATE_WINDOWS,
  EXPERIENCE_LEVELS,
  jobsHref,
  PORTAL_CATEGORIES,
  type PortalSearch,
} from "@/lib/jobs/portal";

const EMPLOYMENT_OPTIONS = [
  "Full Time",
  "Part Time",
  "Contract",
  "Temporary",
  "Internship",
] as const;

const ARRANGEMENT_OPTIONS = ["Remote", "Hybrid", "On-site"] as const;

export type JobsPortalProps = {
  jobs: Job[];
  total: number;
  search: PortalSearch;
  /** Category ids present across the open catalog (not just the current page). */
  availableCategoryIds?: string[];
  error?: string;
};

function hasActiveFilters(search: PortalSearch): boolean {
  return Boolean(
    search.q?.trim() ||
      search.location?.trim() ||
      (search.category && search.category !== "all") ||
      search.date ||
      search.experience ||
      search.employment ||
      search.arrangement ||
      search.easy ||
      search.company ||
      search.verified ||
      search.skill,
  );
}

function JobListSkeleton() {
  return (
    <div aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="jobs-row" style={{ pointerEvents: "none" }}>
          <div className="skeleton" style={{ height: 12, width: 48, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 20, width: "72%", marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 14, width: "55%", marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 12, width: "40%" }} />
        </div>
      ))}
    </div>
  );
}

export function JobsPortal({
  jobs,
  total,
  search,
  availableCategoryIds,
  error,
}: JobsPortalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDesktop, setIsDesktop] = useState(true);
  const [keyword, setKeyword] = useState(search.q ?? "");
  const [location, setLocation] = useState(search.location ?? "");

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1041px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const navigate = (patch: Partial<PortalSearch>) => {
    startTransition(() => {
      router.push(jobsHref(search, { ...patch, page: patch.page ?? 1 }));
    });
  };

  const categories = useMemo(() => {
    const present = new Set(
      availableCategoryIds ??
        jobs.flatMap((job) => job.categories.map((category) => category.id)),
    );
    if (search.category && search.category !== "all") {
      present.add(search.category);
    }
    return [
      { id: "all", label: "All Jobs" },
      ...PORTAL_CATEGORIES.filter((category) => present.has(category.id)).map(
        (category) => ({ id: category.id, label: category.label }),
      ),
    ];
  }, [availableCategoryIds, jobs, search.category]);

  const selectedJob = useMemo(() => {
    if (jobs.length === 0) return undefined;
    if (search.selected) {
      const match = jobs.find(
        (job) => job.slug === search.selected || job.id === search.selected,
      );
      if (match) return match;
    }
    return jobs[0];
  }, [jobs, search.selected]);

  const activeCategory = search.category && search.category !== "all" ? search.category : "all";
  const sortValue = search.sort ?? (search.q?.trim() ? "relevant" : "newest");
  const filtersActive = hasActiveFilters(search);

  const onSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    navigate({
      q: keyword.trim() || undefined,
      location: location.trim() || undefined,
      selected: undefined,
      sort: keyword.trim() ? search.sort ?? "relevant" : search.sort === "relevant" ? "newest" : search.sort,
    });
  };

  const renderEmpty = () => {
    if (error) {
      return (
        <div className="jobs-error">
          <h2>BACKEND ERROR</h2>
          <p>{error}</p>
          <p style={{ marginTop: 16 }}>
            <Link href="/jobs" className="btn btn-dark btn-sm">
              Try again
            </Link>
          </p>
        </div>
      );
    }
    if (isPending) {
      return <JobListSkeleton />;
    }
    if (total === 0 && filtersActive) {
      return (
        <div className="jobs-empty">
          <h2>NO FILTER MATCHES</h2>
          <p>No roles match these filters. Clear a filter or try different keywords.</p>
          <p style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-dark btn-sm"
              onClick={() =>
                navigate({
                  q: undefined,
                  location: undefined,
                  category: undefined,
                  date: undefined,
                  experience: undefined,
                  employment: undefined,
                  arrangement: undefined,
                  easy: false,
                  company: undefined,
                  verified: false,
                  skill: undefined,
                  selected: undefined,
                  sort: undefined,
                })
              }
            >
              Clear filters
            </button>
          </p>
        </div>
      );
    }
    return (
      <div className="jobs-empty">
        <h2>NO CURRENT OPENINGS</h2>
        <p>There are no open roles right now. Check back soon or explore Careers.</p>
        <p style={{ marginTop: 16 }}>
          <Link href="/careers" className="btn btn-primary btn-sm">
            Careers
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </p>
      </div>
    );
  };

  return (
    <div className="jobs-shell">
      <section className="jobs-hero">
        <div className="wrap">
          <p className="jobs-hero-eyebrow">Open positions</p>
          <h1>
            Find work that
            <br />
            <span className="g">moves technology forward.</span>
          </h1>
          <p>
            Explore opportunities across consulting, Oracle, AI, data,
            engineering and enterprise transformation.{" "}
            <Link href="/careers" className="jobs-hero-link">
              Explore careers →
            </Link>
          </p>
          <form className="jobs-search" onSubmit={onSearchSubmit}>
            <input
              type="search"
              name="q"
              placeholder="Search jobs…"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              aria-label="Keyword"
            />
            <input
              type="search"
              name="location"
              placeholder="Location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              aria-label="Location"
            />
            <button type="submit" className="btn btn-primary">
              Search
            </button>
          </form>
        </div>
      </section>

      <div className="wrap" style={{ paddingTop: 8, paddingBottom: 8 }}>
        <div className="jobs-filters">
          <select
            aria-label="Date posted"
            value={search.date ?? ""}
            onChange={(event) =>
              navigate({
                date: event.target.value || undefined,
                selected: undefined,
              })
            }
          >
            <option value="">Date posted</option>
            {DATE_WINDOWS.map((window) => (
              <option key={window.id} value={window.id}>
                {window.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Experience level"
            value={search.experience ?? ""}
            onChange={(event) =>
              navigate({
                experience: event.target.value || undefined,
                selected: undefined,
              })
            }
          >
            <option value="">Experience</option>
            {EXPERIENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          <select
            aria-label="Employment type"
            value={search.employment ?? ""}
            onChange={(event) =>
              navigate({
                employment: event.target.value || undefined,
                selected: undefined,
              })
            }
          >
            <option value="">Employment</option>
            {EMPLOYMENT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            aria-label="Work arrangement"
            value={search.arrangement ?? ""}
            onChange={(event) =>
              navigate({
                arrangement: event.target.value || undefined,
                selected: undefined,
              })
            }
          >
            <option value="">Arrangement</option>
            {ARRANGEMENT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            aria-label="Easy Apply"
            value={search.easy ? "1" : ""}
            onChange={(event) =>
              navigate({
                easy: event.target.value === "1",
                selected: undefined,
              })
            }
          >
            <option value="">Application</option>
            <option value="1">Easy Apply</option>
          </select>
          <select
            aria-label="Sort"
            value={sortValue === "oldest" || sortValue === "salary" ? "newest" : sortValue}
            onChange={(event) =>
              navigate({
                sort: event.target.value === "relevant" ? "relevant" : "newest",
                selected: undefined,
              })
            }
          >
            <option value="newest">Newest</option>
            <option value="relevant">Most Relevant</option>
          </select>
        </div>
        <p style={{ fontSize: 13.5, color: "var(--ink-3)", margin: "4px 0 12px" }}>
          {isPending ? "Updating results…" : `${total} opening${total === 1 ? "" : "s"}`}
        </p>
      </div>

      <div className="jobs-layout">
        <aside className="jobs-cats" aria-label="Categories">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`jobs-cat${activeCategory === category.id ? " active" : ""}`}
              onClick={() =>
                navigate({
                  category: category.id === "all" ? undefined : category.id,
                  selected: undefined,
                })
              }
            >
              {category.label}
            </button>
          ))}
        </aside>

        <div className="jobs-list" aria-live="polite">
          {error || total === 0 || (isPending && jobs.length === 0) ? (
            renderEmpty()
          ) : isPending ? (
            <JobListSkeleton />
          ) : (
            jobs.map((job) => {
              const active = selectedJob?.id === job.id;
              const meta = `${job.location} · ${job.workplaceType} · ${job.employmentType}`;
              const body = (
                <>
                  {job.isNew ? <div className="new">NEW</div> : null}
                  <h3>{job.title}</h3>
                  <div className="meta">
                    {job.company}
                    <br />
                    {meta}
                    {job.skills.length > 0 ? (
                      <>
                        <br />
                        <span className="skills">{job.skills.join(" · ")}</span>
                      </>
                    ) : null}
                    <br />
                    Posted {formatPostedDate(job.postedAt)}
                    {job.applicationType === "INTERNAL" ? (
                      <>
                        {" · "}
                        <span style={{ color: "var(--blue)" }}>Easy Apply →</span>
                      </>
                    ) : null}
                  </div>
                </>
              );

              if (!isDesktop) {
                return (
                  <Link key={job.id} href={`/jobs/${job.slug}`} className="jobs-row">
                    {body}
                  </Link>
                );
              }

              return (
                <button
                  key={job.id}
                  type="button"
                  className={`jobs-row${active ? " active" : ""}`}
                  onClick={() => navigate({ selected: job.slug })}
                >
                  {body}
                </button>
              );
            })
          )}
        </div>

        <div className="jobs-detail">
          {isDesktop ? (
            isPending && !selectedJob ? (
              <div aria-hidden>
                <div className="skeleton" style={{ height: 28, width: "80%", marginBottom: 16 }} />
                <div className="skeleton" style={{ height: 16, width: "60%", marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 16, width: "50%", marginBottom: 28 }} />
                <div className="skeleton" style={{ height: 120, width: "100%" }} />
              </div>
            ) : selectedJob && !error ? (
              <JobDetailView job={selectedJob} compact />
            ) : !error && total === 0 ? null : error ? null : (
              <div className="jobs-empty">
                <h2>Select a role</h2>
                <p>Choose a job from the list to preview details.</p>
              </div>
            )
          ) : (
            <div className="jobs-empty">
              <h2>Open a role</h2>
              <p>Tap a listing to view the full description and apply.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
