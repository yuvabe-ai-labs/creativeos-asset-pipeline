// D377 — polling helpers shared by the dub and lip-sync runners. Everything after the paid call
// retries HERE, in place, never by re-running the task (that would create a second vendor job).

/** A failure that is final: the task reports `failed` with `userMessage`, credits are refunded. */
export class DubbingFinalError extends Error {
  readonly userMessage: string;
  constructor(userMessage: string, detail?: string) {
    super(detail ? `${userMessage} (${detail})` : userMessage);
    this.name = "DubbingFinalError";
    this.userMessage = userMessage;
  }
}

const RETRY_WAIT_SECONDS = 5;

/** Run `fn`, retrying a thrown error up to `attempts` times with a short wait between. A
 *  DubbingFinalError is never retried. */
export async function retryInPlace<T>(fn: () => Promise<T>, sleep: (s: number) => Promise<void>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof DubbingFinalError) throw e;
      last = e;
      if (i < attempts - 1) await sleep(RETRY_WAIT_SECONDS);
    }
  }
  throw last;
}

/** The user-facing copy for a failed run: a DubbingFinalError's own message (also when Trigger
 *  serialized it and only the name survived), otherwise `fallback`. */
export function finalUserMessage(error: unknown, fallback: string): string {
  if (error instanceof DubbingFinalError) return error.userMessage;
  const e = error as { name?: unknown; userMessage?: unknown } | null | undefined;
  if (e?.name === "DubbingFinalError" && typeof e.userMessage === "string") return e.userMessage;
  return fallback;
}

/** Whether a task error is the stored-but-undelivered one (see DeliveryFailedError in the tasks).
 *  `instanceof` alone misses an error Trigger serialized, which keeps only its name. */
export function isDeliveryFailed(error: unknown): boolean {
  return (error as { name?: unknown } | null | undefined)?.name === "DeliveryFailedError";
}
