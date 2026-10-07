export const JOB_CLOSED_MESSAGE = "This position is no longer accepting applications.";

/** The job lookup succeeded and the job is genuinely not open (missing, closed, expired, unpublished). */
export class JobClosedError extends Error {
  constructor() {
    super(JOB_CLOSED_MESSAGE);
    this.name = "JobClosedError";
  }
}
