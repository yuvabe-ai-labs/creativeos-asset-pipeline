/**
 * Appended to every prompt sent to an image model — fresh generations and edits alike.
 * Product shots are the dominant use case, and models drift on brand marks unless told
 * to hold the product (and especially its logo) exactly as the references show it.
 */
export const PRODUCT_DETAIL_SUFFIX =
  "Reference the product as is and pay special attention to the details in the logo.";

// D366 — how long an image run may take, end to end. No `server-only`: the canvas reads the max
// age to tell a live run from a stuck one, and the task reads its provider timeout.

/** The image-generate task's provider call is abandoned after this, inside its 600s maxDuration,
 *  so a hung call fails normally (and reports `failed`) instead of being killed silently. */
export const IMAGE_PROVIDER_TIMEOUT_MS = 540 * 1000;

/** A queued image run that has not started by then expires instead. With the run's own time
 *  (two 600s attempts plus backoff) it stays inside IMAGE_RUN_MAX_AGE_MS. */
export const IMAGE_RUN_QUEUE_TTL = "15m";

/** A `running` image row older than this is stuck, not live: the queue TTL (15 min) plus two 600s
 *  attempts and backoff, with margin, so a live run is never mistaken for a stuck one (which would
 *  allow a second paid run). Kept under the credit sweep (stuck_reservations, 50 minutes). It no
 *  longer refuses a new start (hasRunningGeneration) nor shows the node as generating
 *  (nodeGenerationStatus). */
export const IMAGE_RUN_MAX_AGE_MS = 40 * 60 * 1000;
