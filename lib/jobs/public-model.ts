/**
 * Client-safe public Job view-model helpers.
 * Do NOT import recruiting/Supabase from this module.
 */

import type { CareerArea } from "@/types/recruiting";

export type Job = {
  id: string;
  slug: string;
  title: string;
  department: string;
  careerArea: CareerArea;
  location: string;
  workplaceType: "Remote" | "Hybrid" | "On-site";
  employmentType: "Full Time" | "Part Time" | "Contract" | "Temporary" | "Internship";
  summary: string;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  preferredQualifications?: string[];
  postedAt: string;
  status: "open" | "closed";
  acceptingApplications: boolean;
  isNew: boolean;
  isDemo: boolean;
  requisitionId: string;
  /** Public reference number (e.g. REQ-2026-0142); falls back to the requisition id. */
  referenceNumber: string;
  /** Application deadline, else listing expiry — the date applications close, if set. */
  closesAt?: string;
  company: string;
  companySummary?: string;
  experienceLevel?: string;
  applicationType: "INTERNAL" | "EXTERNAL";
  externalApplyUrl?: string;
  salaryLabel?: string;
  salaryMin?: number;
  salaryMax?: number;
  skills: string[];
  categories: { id: string; label: string }[];
  verified: boolean;
};

export type JobFilters = {
  query?: string;
  location?: string;
  careerArea?: string;
  workplaceType?: string;
  employmentType?: string;
};

export function formatPostedDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
