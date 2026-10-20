import { describe, it, expect } from "vitest";
import { LOCK_HANDOFF_MS, markLockHandoff, readOrCreateLockSessionId, takeLockHandoff } from "./lock-session";

// A minimal stand-in for sessionStorage — per-tab storage that survives a reload.
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

let counter = 0;
const freshId = () => `id-${++counter}`;

describe("readOrCreateLockSessionId", () => {
  it("creates and stores an id when the tab has none yet", () => {
    const storage = fakeStorage();
    const id = readOrCreateLockSessionId("canvas-1", storage, freshId);
    expect(id).toBeTruthy();
    expect(storage.getItem("canvas-lock-session:canvas-1")).toBe(id);
  });

  // THE REGRESSION: takeOver() acquires the lock, then reloads the page. If the
  // reloaded tab comes back with a new session id, it cannot re-acquire the lock it
  // just took — the heartbeat is milliseconds old, so it is neither unheld, nor
  // same-session, nor stale — and the take-over banner reappears forever.
  it("returns the same id across a reload, so a tab can re-acquire its own lock", () => {
    const storage = fakeStorage();
    const before = readOrCreateLockSessionId("canvas-1", storage, freshId);
    const afterReload = readOrCreateLockSessionId("canvas-1", storage, freshId);
    expect(afterReload).toBe(before);
  });

  it("keeps separate ids per canvas", () => {
    const storage = fakeStorage();
    const a = readOrCreateLockSessionId("canvas-a", storage, freshId);
    const b = readOrCreateLockSessionId("canvas-b", storage, freshId);
    expect(a).not.toBe(b);
  });

  it("falls back to a fresh id when there is no storage (server render)", () => {
    const a = readOrCreateLockSessionId("canvas-1", null, freshId);
    const b = readOrCreateLockSessionId("canvas-1", null, freshId);
    expect(a).toBeTruthy();
    expect(b).not.toBe(a);
  });

  it("falls back to a fresh id when storage throws (private browsing)", () => {
    const hostile = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(readOrCreateLockSessionId("canvas-1", hostile, freshId)).toBeTruthy();
  });
});

// D390 — moving between the canvas and its editor in one tab keeps the lock: the page being left
// marks a handoff and skips its unmount release, so that release can't land after the next page
// has taken the lock.
function fullStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("lock handoff", () => {
  it("a fresh mark is taken once", () => {
    const storage = fullStorage();
    markLockHandoff("canvas-1", storage, 1_000);
    expect(takeLockHandoff("canvas-1", storage, 2_000)).toBe(true);
    expect(takeLockHandoff("canvas-1", storage, 2_001)).toBe(false);
  });

  it("a stale mark doesn't skip a real release", () => {
    const storage = fullStorage();
    markLockHandoff("canvas-1", storage, 1_000);
    expect(takeLockHandoff("canvas-1", storage, 1_000 + LOCK_HANDOFF_MS + 1_000)).toBe(false);
  });

  it("is per canvas", () => {
    const storage = fullStorage();
    markLockHandoff("canvas-1", storage, 1_000);
    expect(takeLockHandoff("canvas-2", storage, 1_001)).toBe(false);
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
      removeItem: () => { throw new Error("denied"); },
    };
    expect(() => markLockHandoff("canvas-1", broken, 1)).not.toThrow();
    expect(takeLockHandoff("canvas-1", broken, 2)).toBe(false);
    expect(takeLockHandoff("canvas-1", null, 2)).toBe(false);
  });
});
