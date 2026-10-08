import type { ResumeParseState } from "@/lib/candidate-portal/types";
import type { ApplicationStatus } from "@/types/recruiting";

/**
 * Candidate-facing application status. Internal pipeline stages (recruiter
 * screen vs. hiring-manager review, final vs. first interview) are collapsed
 * so the portal never exposes internal routing or evaluation detail.
 */
export function candidateStatus(status: ApplicationStatus): { label: string; tone: "blue" | "amber" | "green" | "red" | "" } {
  switch (status) {
    case "APPLIED":
      return { label: "Submitted", tone: "blue" };
    case "REVIEW":
    case "RECRUITER_SCREEN":
    case "HIRING_MANAGER_REVIEW":
      return { label: "Under review", tone: "blue" };
    case "INTERVIEW":
    case "FINAL_INTERVIEW":
      return { label: "Interviewing", tone: "amber" };
    case "OFFER":
      return { label: "Offer", tone: "green" };
    case "HIRED":
      return { label: "Hired", tone: "green" };
    case "REJECTED":
      return { label: "Not selected", tone: "" };
    case "WITHDRAWN":
      return { label: "Withdrawn", tone: "" };
    case "CLOSED":
      return { label: "Position closed", tone: "" };
    default:
      return { label: "In progress", tone: "" };
  }
}

export function parseStateLabel(state: ResumeParseState): { label: string; tone: "blue" | "amber" | "green" | "red" | "" } {
  switch (state) {
    case "PARSED":
      return { label: "Ready", tone: "green" };
    case "PENDING":
      return { label: "Processing", tone: "blue" };
    case "UNSUPPORTED":
      return { label: "Couldn't read file", tone: "amber" };
    default:
      return { label: "Couldn't read file", tone: "amber" };
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
