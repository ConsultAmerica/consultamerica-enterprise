import { createMemoryRecruitingRepository } from "../lib/recruiting";
import { getOpenJobs, searchPublicJobs } from "../lib/jobs";

async function main() {
  const repo = createMemoryRecruitingRepository();
  const published = await repo.listPublishedPostings();
  const open = await getOpenJobs();
  const rendered = await searchPublicJobs({ sort: "newest" });
  console.log(
    JSON.stringify(
      {
        mode: "memory/demo",
        publishedEligible: published.length,
        openJobs: open.length,
        rendered: rendered.total,
        sample: open.slice(0, 3).map((j) => ({
          title: j.title,
          isNew: j.isNew,
          applicationType: j.applicationType,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
