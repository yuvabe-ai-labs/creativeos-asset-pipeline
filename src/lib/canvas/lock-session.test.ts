import { describe, it, expect } from "vitest";
import { readOrCreateLockSessionId } from "./lock-session";

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
