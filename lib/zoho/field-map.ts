/**
 * The one place a Neon candidate + application becomes a Zoho Contacts payload.
 *
 * Everything about the Zoho side of the mapping is a constant in this file:
 * field API names, the Lead_Source value, and the picklist vocabulary. Zoho
 * field names change (a rename in the layout editor, a move to a different
 * module), and when they do the change should be one line here and nothing
 * anywhere else.
 *
 * Five recruitment attributes have no native home in Contacts and live in
 * custom fields created on the live layout: Applied_Job, Application_Date,
 * Hiring_Status, Assigned_Recruiter and Application_Ref.
 *
 * Nothing in this file performs I/O. It is pure, which is what lets the sync
 * worker validate a payload and reject it before spending an API call.
 */

import type { ApplicationStatus } from "@/lib/neon/types";

// ------------------------------------------------------------------ field names

/** Native Contacts fields. Confirmed present on the live module. */
export const ZOHO_CONTACT_FIELDS = {
  firstName: "First_Name",
  /** The only system-mandatory field on Contacts. */
  lastName: "Last_Name",
  email: "Email",
  phone: "Phone",
  leadSource: "Lead_Source",
} as const;

/**
 * Custom fields carrying the recruitment attributes.
 *
 * Repoint a value here to follow a rename in Zoho. The types on the live
 * layout are: Applied_Job text, Application_Date date, Hiring_Status picklist,
 * Assigned_Recruiter text, Application_Ref text.
 */
export const ZOHO_RECRUITMENT_FIELDS = {
  /** Title of the role applied for. */
  appliedJob: "Applied_Job",
  /** Date only, yyyy-MM-dd. A full timestamp is rejected by a Zoho date field. */
  applicationDate: "Application_Date",
  /** Picklist, limited to ZOHO_HIRING_STATUSES below. */
  hiringStatus: "Hiring_Status",
  /** Admin's full name, empty string when the application is unassigned. */
  assignedRecruiter: "Assigned_Recruiter",
  /** Our APP-YYYY-NNNN reference, so a Zoho record ties back to a Neon row. */
  applicationRef: "Application_Ref",
} as const;

/** Lead_Source is a picklist; this value exists on it. */
export const ZOHO_LEAD_SOURCE = "Careers Site";

/**
 * Timezone for Application_Date.
 *
 * The rest of the app formats dates for a US east-coast audience
 * (see lib/email/enquiry-template.ts), and an application filed at 9pm in New
 * York is a 9pm-that-day event to the recruiter reading it. Formatting via
 * toISOString() would render it as the following day, which is the kind of
 * off-by-one nobody notices until a deadline is involved.
 */
export const APPLICATION_DATE_TIMEZONE = "America/New_York";

// --------------------------------------------------------------------- picklist

/**
 * Exactly the values the Hiring_Status picklist accepts, plus Zoho's own
 * "-None-" sentinel. Zoho rejects anything else outright.
 */
export type ZohoHiringStatus =
  | "NEW"
  | "SCREENING"
  | "INTERVIEW"
  | "SHORTLISTED"
  | "OFFER"
  | "HIRED"
  | "REJECTED"
  | "WITHDRAWN";

export const ZOHO_HIRING_STATUSES: readonly ZohoHiringStatus[] = [
  "NEW",
  "SCREENING",
  "INTERVIEW",
  "SHORTLISTED",
  "OFFER",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
];

/** Zoho's "nothing selected" value for a picklist. */
export const ZOHO_PICKLIST_NONE = "-None-";

/**
 * Application status to picklist value, written out rather than passed through.
 *
 * The two vocabularies are identical today, so `status as ZohoHiringStatus`
 * would compile and work. It is spelled out anyway because the two are owned
 * by different systems: the Postgres CHECK can be widened in a migration, and
 * when that happens this must break at the mapping layer with a message naming
 * the offending value, not three layers down as an opaque Zoho validation
 * error on a queue row nobody is watching.
 *
 * `satisfies Record<ApplicationStatus, ...>` makes adding a status to the union
 * in lib/neon/types.ts a compile error here.
 */
const HIRING_STATUS_BY_APPLICATION_STATUS = {
  NEW: "NEW",
  SCREENING: "SCREENING",
  INTERVIEW: "INTERVIEW",
  SHORTLISTED: "SHORTLISTED",
  OFFER: "OFFER",
  HIRED: "HIRED",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
} as const satisfies Record<ApplicationStatus, ZohoHiringStatus>;

// ----------------------------------------------------------------------- errors

export type ZohoMappingErrorCode =
  | "MISSING_LAST_NAME"
  | "MISSING_EMAIL"
  | "UNMAPPED_HIRING_STATUS"
  | "INVALID_APPLICATION_DATE";

/**
 * A payload that Zoho would reject, caught before it is sent.
 *
 * Always non-retryable: the stored data is wrong, so re-sending the same
 * record later cannot produce a different outcome. The sync worker abandons
 * the job immediately with this message rather than burning eight attempts
 * over eight hours on it. A write that silently disappears between two systems
 * is worse than one that fails where somebody can see it.
 */
export class ZohoMappingError extends Error {
  readonly code: ZohoMappingErrorCode;
  readonly retryable = false as const;

  constructor(code: ZohoMappingErrorCode, message: string) {
    super(message);
    this.name = "ZohoMappingError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------- mapping

/** The application context attached to a contact, when there is one. */
export interface ZohoApplicationContext {
  /** applications.reference, e.g. APP-2026-0042. */
  reference: string;
  /**
   * applications.status. Typed as string, not ApplicationStatus: it arrives
   * from Postgres, where the CHECK constraint is the real source of truth and
   * can hold a value this build's union does not know about.
   */
  status: string;
  /** applications.applied_at, a timestamptz the driver hands back as a Date. */
  appliedAt: Date;
  jobTitle: string;
  /** admin_users.full_name, or null when nobody is assigned. */
  assignedRecruiterName: string | null;
}

export interface ZohoContactSource {
  firstName: string | null;
  lastName: string;
  email: string;
  phone: string | null;
  /**
   * Null when the candidate has no application. A CANDIDATE sync job can be
   * queued for somebody who only exists as a profile, and the recruitment
   * fields are then left alone rather than blanked.
   */
  application: ZohoApplicationContext | null;
}

/** A Contacts record as Zoho's API expects it. */
export type ZohoContactPayload = Record<string, unknown>;

/**
 * Build the Contacts payload.
 *
 * Empty optional values are omitted rather than sent as "". The operation is
 * an upsert, so every field present in the payload overwrites what Zoho holds;
 * sending a blank first name for a sparse re-application would erase a name
 * the first application captured. This mirrors the same decision in
 * lib/neon/candidates.ts, where a value only ever moves from absent to present.
 *
 * Assigned_Recruiter is the exception: an empty string is a real value there,
 * because "unassigned" has to be able to clear a previous assignment.
 */
export function buildContactPayload(source: ZohoContactSource): ZohoContactPayload {
  const lastName = source.lastName?.trim() ?? "";
  if (lastName === "") {
    throw new ZohoMappingError(
      "MISSING_LAST_NAME",
      "Last_Name is mandatory in Zoho and this candidate has none, so the record " +
        "was not sent. Fix the candidate record and requeue the sync.",
    );
  }

  const email = source.email?.trim() ?? "";
  if (email === "") {
    throw new ZohoMappingError(
      "MISSING_EMAIL",
      "Email is the duplicate-check field for the Contacts upsert. Without it " +
        "every sync would insert a new contact instead of updating the existing " +
        "one, so the record was not sent.",
    );
  }

  const payload: ZohoContactPayload = {
    [ZOHO_CONTACT_FIELDS.lastName]: lastName,
    [ZOHO_CONTACT_FIELDS.email]: email,
    [ZOHO_CONTACT_FIELDS.leadSource]: ZOHO_LEAD_SOURCE,
  };

  const firstName = source.firstName?.trim();
  if (firstName) {
    payload[ZOHO_CONTACT_FIELDS.firstName] = firstName;
  }

  const phone = source.phone?.trim();
  if (phone) {
    payload[ZOHO_CONTACT_FIELDS.phone] = phone;
  }

  const application = source.application;
  if (application) {
    payload[ZOHO_RECRUITMENT_FIELDS.appliedJob] = application.jobTitle.trim();
    payload[ZOHO_RECRUITMENT_FIELDS.applicationRef] = application.reference.trim();
    payload[ZOHO_RECRUITMENT_FIELDS.applicationDate] = toZohoDate(application.appliedAt);
    payload[ZOHO_RECRUITMENT_FIELDS.hiringStatus] = toZohoHiringStatus(application.status);
    payload[ZOHO_RECRUITMENT_FIELDS.assignedRecruiter] =
      application.assignedRecruiterName?.trim() ?? "";
  }

  return payload;
}

/**
 * Translate an application status into the Hiring_Status picklist value.
 *
 * Throws rather than falling back to "-None-" on an unknown value: a silent
 * fallback would show every recruiter a blank status and look like a Zoho
 * problem, while the real cause would be a status added to Postgres and never
 * added to the picklist.
 */
export function toZohoHiringStatus(status: string): ZohoHiringStatus {
  const mapped = (
    HIRING_STATUS_BY_APPLICATION_STATUS as Record<string, ZohoHiringStatus | undefined>
  )[status];

  if (!mapped) {
    throw new ZohoMappingError(
      "UNMAPPED_HIRING_STATUS",
      `Application status ${JSON.stringify(status)} has no Hiring_Status picklist ` +
        `value. Add it to HIRING_STATUS_BY_APPLICATION_STATUS in lib/zoho/field-map.ts ` +
        `and to the picklist in Zoho. Known values: ${ZOHO_HIRING_STATUSES.join(", ")}.`,
    );
  }

  return mapped;
}

// Constructed once at module load. Creating an Intl formatter is expensive
// enough that doing it per record would show up on a full batch, and this
// performs no I/O so it is safe to build at import time.
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: APPLICATION_DATE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Format a timestamp as the yyyy-MM-dd a Zoho date field accepts.
 *
 * Built from Intl parts rather than string arithmetic on an ISO value, because
 * the calendar date depends on the timezone and only Intl knows where the US
 * east coast was on daylight saving the day in question.
 */
export function toZohoDate(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    throw new ZohoMappingError(
      "INVALID_APPLICATION_DATE",
      "The application date is not a valid timestamp, so the record was not sent.",
    );
  }

  const parts = DATE_FORMATTER.formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    // Only reachable if the runtime ships no ICU data for this timezone, in
    // which case guessing a date would be worse than refusing.
    throw new ZohoMappingError(
      "INVALID_APPLICATION_DATE",
      `Could not format the application date in ${APPLICATION_DATE_TIMEZONE}.`,
    );
  }

  return `${year}-${month}-${day}`;
}
