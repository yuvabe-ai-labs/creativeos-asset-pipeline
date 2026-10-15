/** D374 — the longest clip the node dubs. Generated takes are well under it. */
export const DUB_MAX_SECONDS = 60;
/** D377 — checkpointed wait between status polls. */
export const DUB_POLL_INTERVAL_SECONDS = 10;
/** D377 — a run gives up here, well inside the 50-minute stuck-reservation sweep (0055). */
export const DUB_POLL_TIMEOUT_MS = 12 * 60 * 1000;
/** Signed PUT URLs must outlive the poll timeout plus queueing. */
export const DUBBING_UPLOAD_EXPIRY_MS = 2 * 60 * 60 * 1000;
