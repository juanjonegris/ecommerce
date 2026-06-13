/** Name of the BullMQ queue that handles upload-related background work. */
export const UPLOADS_QUEUE = 'uploads';

export interface UploadsJobBase {
  /** Stamped by the typed producer so worker logs correlate with the originating
   *  HTTP request (CLS is not available inside BullMQ workers). */
  requestId?: string;
}

/** Repeatable hourly cron — sweeps PENDING_UPLOAD rows older than 1h. */
export type CleanupStaleUploadsJob = UploadsJobBase;

export type UploadsJobData = CleanupStaleUploadsJob;
