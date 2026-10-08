import type { Metadata } from "next";
import Link from "next/link";

import { ProfileForm } from "@/components/candidate/ProfileForm";
import { requireCandidate } from "@/lib/candidate-portal/session";
import { getCandidatePortalStore } from "@/lib/candidate-portal/store";

export const metadata: Metadata = { title: "Profile" };

export default async function CandidateProfilePage() {
  const session = await requireCandidate("/candidate/profile");
  const profile = await getCandidatePortalStore().getProfile(session.candidateId);

  return (
    <>
      <div className="ws-head">
        <div>
          <p className="ws-eyebrow">Candidate portal</p>
          <h1>Profile</h1>
          <p>
            Personal details used to prefill Detailed Apply. Your work experience, education, skills and certifications
            come from your résumés — review and correct them in the <Link href="/candidate/resumes">résumé library</Link>.
          </p>
        </div>
      </div>
      <section className="ws-panel">
        {profile ? <ProfileForm profile={profile} /> : <p className="ws-muted">We couldn&apos;t load your profile.</p>}
      </section>
    </>
  );
}
