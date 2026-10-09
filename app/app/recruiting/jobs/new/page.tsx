import Link from "next/link";

import { JobForm } from "@/components/workspace/JobForm";
import { recruitingRepository } from "@/lib/recruiting";
import { createJobAction } from "@/lib/recruiting/job-actions";

export const metadata = { title: "New job" };

export default async function NewJobPage() {
  const [departments, locations, positions] = await Promise.all([
    recruitingRepository.listDepartments(),
    recruitingRepository.listLocations(),
    recruitingRepository.listPositions(),
  ]);

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">
            <Link href="/app/recruiting/jobs">Jobs</Link> · New
          </p>
          <h1>Create a requisition</h1>
          <p>
            A requisition is the internal record of a role you are hiring for. It is saved as a draft unless you choose
            to publish it, so nothing reaches the public careers site by accident.
          </p>
        </div>
      </div>

      <JobForm mode="create" lookups={{ departments, locations, positions }} action={createJobAction} />
    </>
  );
}
