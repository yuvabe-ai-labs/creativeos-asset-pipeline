// The editing lock's per-tab session identity (D33).
//
// This MUST survive a page reload. takeOver() acquires the lock and then reloads to
// pick up the latest committed canvas; if the reloaded tab came back with a fresh id it
// would be a stranger to the lock it had just taken — the heartbeat is milliseconds old,
// so acquire_canvas_lock's three conditions (unheld / same session / stale) all fail and
// the tab drops back to viewer. That put "Take over editing" into an endless loop, and
// it also meant an ordinary F5 while editing locked you out of your own canvas until the
// 45s TTL expired.
//
// sessionStorage is exactly the right scope: per tab, cleared when the tab closes, and
// preserved across reloads — the same lifetime the lock is meant to track.
//
// Known trade-off: Chrome copies sessionStorage into a DUPLICATED tab, so duplicating a
// tab that has a canvas open gives both copies the same id, and both would believe they
// hold the lock. That is rarer, and far less damaging, than the take-over loop this
// replaces — but it is the reason to reach for a per-tab token (once one exists) rather
// than widening this to localStorage.

const KEY_PREFIX = "canvas-lock-session:";

type ReadWriteStorage = Pick<Storage, "getItem" | "setItem">;

// Storage and id generation are injected so this is testable with no DOM.
export function readOrCreateLockSessionId(
  canvasId: string,
  storage: ReadWriteStorage | null,
  createId: () => string,
): string {
  // No storage: a server render, or a browser that denies access. A per-call id is the
  // right degradation — it behaves exactly like the old code did.
  if (!storage) return createId();

  const key = `${KEY_PREFIX}${canvasId}`;
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const id = createId();
    storage.setItem(key, id);
    return id;
  } catch {
    // Safari private mode and friends throw on sessionStorage access rather than
    // returning null. Degrade instead of taking the canvas down.
    return createId();
  }
}

export function getLockSessionId(canvasId: string): string {
  const storage =
    typeof window === "undefined" ? null : window.sessionStorage;
  return readOrCreateLockSessionId(canvasId, storage, () => crypto.randomUUID());
}
