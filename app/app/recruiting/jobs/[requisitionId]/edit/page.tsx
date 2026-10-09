import Link from "next/link";
import { notFound } from "next/navigation";

import { JobForm } from "@/components/workspace/JobForm";
import { recruitingRepository } from "@/lib/recruiting";
import { updateJobAction } from "@/lib/recruiting/job-actions";

export const metadata = { title: "Edit job" };

type Props = { params: Promise<{ requisitionId: string }> };

export default async function EditJobPage({ params }: Props) {
  const { requisitionId } = await params;
  const [detail, posting, departments, locations, positions, benefits] = await Promise.all([
    recruitingRepository.getJobDetail(requisitionId),
    recruitingRepository.getPostingForRequisition(requisitionId),
    recruitingRepository.listDepartments(),
    recruitingRepository.listLocations(),
    recruitingRepository.listPositions(),
    // Read separately: benefits is not on JobRequisition/Job, and without this
    // the textarea would prefill empty and the save would wipe stored benefits.
    recruitingRepository.getJobBenefits(requisitionId),
  ]);
  if (!detail) notFound();

  const r = detail.requisition;

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">
            <Link href="/app/recruiting/jobs">Jobs</Link> ·{" "}
            <Link href={`/app/recruiting/jobs/${requisitionId}`}>{r.requisitionNumber}</Link> · Edit
          </p>
          <h1>Edit requisition</h1>
          <p>
            Changes apply to the requisition and, where one exists, to its public posting. Editing never publishes or
            unpublishes a job.
          </p>
        </div>
      </div>

      <JobForm
        mode="edit"
        lookups={{ departments, locations, positions }}
        action={updateJobAction}
        initial={{
          requisitionId,
          title: r.title,
          departmentId: r.departmentId,
          positionId: r.positionId,
          locationId: r.locationId,
          employmentType: r.employmentType,
          workplaceType: r.workplaceType,
          careerArea: r.careerArea,
          openings: r.openings,
          salaryMin: r.salaryMin === undefined ? "" : String(r.salaryMin),
          salaryMax: r.salaryMax === undefined ? "" : String(r.salaryMax),
          // Level and closing date live on the posting, not the requisition.
          experienceLevel: posting?.experienceLevel ?? "",
          applicationDeadline: posting?.applicationDeadline?.slice(0, 10) ?? "",
          description: r.description,
          responsibilities: r.responsibilities,
          qualifications: r.qualifications,
          preferredQualifications: r.preferredQualifications,
          benefits,
        }}
      />
    </>
  );
}
