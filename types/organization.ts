/**
 * Shared organization reference data.
 * Used by Recruiting (Phase 2), Core HR (Phase 3), and Payroll (Phase 5).
 */

export type RecordStatus = "ACTIVE" | "INACTIVE";

export type LegalEntity = {
  id: string;
  code: string;
  name: string;
  country: string;
  taxIdentifier?: string;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type BusinessUnit = {
  id: string;
  legalEntityId: string;
  code: string;
  name: string;
  description?: string;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type Department = {
  id: string;
  businessUnitId: string;
  code: string;
  name: string;
  description?: string;
  managerEmployeeId?: string;
  status: RecordStatus;
  effectiveStartDate: string;
  effectiveEndDate?: string;
  createdAt: string;
  updatedAt: string;
};

export type Position = {
  id: string;
  departmentId: string;
  code: string;
  title: string;
  jobFamily?: string;
  jobLevel?: string;
  employmentType: EmploymentType;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type Location = {
  id: string;
  code: string;
  name: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country: string;
  timezone?: string;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "TEMPORARY";

export type WorkplaceType = "REMOTE" | "HYBRID" | "ONSITE";

export const employmentTypeLabels: Record<EmploymentType, string> = {
  FULL_TIME: "Full Time",
  PART_TIME: "Part Time",
  CONTRACT: "Contract",
  TEMPORARY: "Temporary",
};

export const workplaceTypeLabels: Record<WorkplaceType, string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ONSITE: "On-site",
};
