// D366 — the retry rule for tasks that pay a provider (image-generate, video-generate), the one
// video-voice-change.ts already follows. No `server-only`: Trigger.dev tasks import it.
//
// Report `failed` only on the run's FINAL attempt. Reporting it earlier refunds and marks the
// generation terminal, so the retry's result — paid for — is then dropped by completeGeneration's
// duplicate guard. And once the provider has returned, never retry: that would pay it again.

/** A failure after the provider returned a (paid) result — an upload or the webhook. */
export class PaidResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaidResultError";
  }
}

/** A task's model lookup failed (no catalog row or no adapter). Final: a retry finds the same. */
export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

/** Whether this failure ends the run: report it as `failed`, and do not retry. */
export function isFinalAttempt(attemptNumber: number, maxAttempts: number, error: unknown): boolean {
  return error instanceof PaidResultError || error instanceof ModelUnavailableError || attemptNumber >= maxAttempts;
}
