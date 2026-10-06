import {
  APPLICATION_TERMINAL_STATUSES,
  type ApplicationStatus,
  type OfferStatus,
  type RequisitionStatus,
} from "@/types/recruiting";

const REQUISITION_TRANSITIONS: Record<RequisitionStatus, RequisitionStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "DRAFT", "CANCELLED"],
  APPROVED: ["PUBLISHED", "ON_HOLD", "CANCELLED"],
  REJECTED: ["DRAFT", "CANCELLED"],
  PUBLISHED: ["ON_HOLD", "FILLED", "CANCELLED"],
  ON_HOLD: ["APPROVED", "PUBLISHED", "CANCELLED"],
  FILLED: [],
  CANCELLED: [],
};

const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  // APPLIED ≈ submitted. Allow recruiter to advance without forced REVIEW hop,
  // including scheduling an interview directly (Schedule Interview is offered
  // on every application row regardless of stage).
  APPLIED: [
    "REVIEW",
    "RECRUITER_SCREEN",
    "INTERVIEW",
    "REJECTED",
    "WITHDRAWN",
    "CLOSED",
  ],
  REVIEW: [
    "RECRUITER_SCREEN",
    "HIRING_MANAGER_REVIEW",
    "REJECTED",
    "WITHDRAWN",
    "CLOSED",
  ],
  RECRUITER_SCREEN: [
    "HIRING_MANAGER_REVIEW",
    "INTERVIEW",
    "REJECTED",
    "WITHDRAWN",
    "CLOSED",
  ],
  HIRING_MANAGER_REVIEW: [
    "INTERVIEW",
    "REJECTED",
    "WITHDRAWN",
    "CLOSED",
  ],
  INTERVIEW: [
    "FINAL_INTERVIEW",
    "OFFER",
    "REJECTED",
    "WITHDRAWN",
    "CLOSED",
  ],
  FINAL_INTERVIEW: ["OFFER", "REJECTED", "WITHDRAWN", "CLOSED"],
  OFFER: ["HIRED", "REJECTED", "WITHDRAWN", "CLOSED"],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
  CLOSED: [],
};

const OFFER_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  // DRAFT → EXTENDED covers approve-and-send without a separate queue hop.
  DRAFT: ["PENDING_APPROVAL", "EXTENDED", "WITHDRAWN"],
  PENDING_APPROVAL: ["EXTENDED", "DRAFT", "WITHDRAWN"],
  EXTENDED: ["ACCEPTED", "DECLINED", "EXPIRED", "WITHDRAWN"],
  ACCEPTED: [],
  DECLINED: [],
  WITHDRAWN: [],
  EXPIRED: [],
};

export function canTransitionRequisition(
  from: RequisitionStatus,
  to: RequisitionStatus,
): boolean {
  return REQUISITION_TRANSITIONS[from].includes(to);
}

export function canTransitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  return APPLICATION_TRANSITIONS[from].includes(to);
}

export function canTransitionOffer(from: OfferStatus, to: OfferStatus): boolean {
  return OFFER_TRANSITIONS[from].includes(to);
}

export function isTerminalApplicationStatus(status: ApplicationStatus): boolean {
  return APPLICATION_TERMINAL_STATUSES.includes(status);
}

/**
 * Hire conversion is allowed when offer is ACCEPTED and application is OFFER.
 * HIRED + ACCEPTED is also allowed so hireCandidate stays idempotent.
 */
export function canConvertToEmployee(input: {
  applicationStatus: ApplicationStatus;
  offerStatus?: OfferStatus;
}): boolean {
  if (input.offerStatus !== "ACCEPTED") return false;
  return (
    input.applicationStatus === "OFFER" || input.applicationStatus === "HIRED"
  );
}

export function assertApplicationTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
): void {
  if (!canTransitionApplication(from, to)) {
    throw new Error(`Invalid application transition: ${from} → ${to}`);
  }
}

export function allowedApplicationTransitions(
  from: ApplicationStatus,
): ApplicationStatus[] {
  return [...APPLICATION_TRANSITIONS[from]];
}

export function assertRequisitionTransition(
  from: RequisitionStatus,
  to: RequisitionStatus,
): void {
  if (!canTransitionRequisition(from, to)) {
    throw new Error(`Invalid requisition transition: ${from} → ${to}`);
  }
}
