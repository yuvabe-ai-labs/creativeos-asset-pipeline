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
