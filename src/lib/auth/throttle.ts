import "server-only";

/**
 * A short wait between reset emails to one address (D598): after one is sent, the same email
 * gets no other for `cooldownMs`. Kept in this server's memory, no table: each instance has its
 * own, so the limit is loose with several running, which is fine at our size. It only stops a
 * form being pressed over and over at one inbox; nobody gains access through it.
 */
const lastSent = new Map<string, number>();
const MAX_KEYS = 10_000;

export function takeResetCooldown(email: string, cooldownMs: number, now = Date.now()): boolean {
  const key = email.trim().toLowerCase();
  const last = lastSent.get(key);
  if (last !== undefined && now - last < cooldownMs) return false;
  if (lastSent.size >= MAX_KEYS) {
    for (const [k, t] of lastSent) if (now - t >= cooldownMs) lastSent.delete(k);
    if (lastSent.size >= MAX_KEYS) lastSent.clear();
  }
  lastSent.set(key, now);
  return true;
}

/** Tests only. */
export function resetCooldownsForTest(): void {
  lastSent.clear();
}
