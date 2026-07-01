import { describe, it, expect } from "vitest";
import {
  isLockStale, lockReducer, canEdit, INITIAL_LOCK_STATE, STALE_MS,
} from "./lock-state";

const NOW = 1_000_000;

describe("isLockStale", () => {
  it("is stale when heartbeat is null", () => {
    expect(isLockStale(null, NOW)).toBe(true);
  });
  it("is stale when heartbeat is older than STALE_MS", () => {
    const old = new Date(NOW - STALE_MS - 1).toISOString();
    expect(isLockStale(old, NOW)).toBe(true);
  });
  it("is fresh when heartbeat is within STALE_MS", () => {
    const recent = new Date(NOW - 1000).toISOString();
    expect(isLockStale(recent, NOW)).toBe(false);
  });
  it("is stale for an unparseable timestamp", () => {
    expect(isLockStale("not-a-date", NOW)).toBe(true);
  });
});

describe("lockReducer", () => {
  it("acquired → editor (canEdit true)", () => {
    const s = lockReducer(INITIAL_LOCK_STATE, { type: "acquired" });
    expect(s.role).toBe("editor");
    expect(canEdit(s)).toBe(true);
  });
  it("denied → viewer, records holder name, cannot edit or take over", () => {
    const s = lockReducer(INITIAL_LOCK_STATE, { type: "denied", heldByName: "Cyril" });
    expect(s.role).toBe("viewer");
    expect(s.heldByName).toBe("Cyril");
    expect(canEdit(s)).toBe(false);
    expect(s.canTakeOver).toBe(false);
  });
  it("heartbeatLost → viewer (was editor)", () => {
    const editor = lockReducer(INITIAL_LOCK_STATE, { type: "acquired" });
    const s = lockReducer(editor, { type: "heartbeatLost" });
    expect(s.role).toBe("viewer");
    expect(canEdit(s)).toBe(false);
  });
  it("lockFreed while viewer → canTakeOver true", () => {
    const viewer = lockReducer(INITIAL_LOCK_STATE, { type: "denied", heldByName: "X" });
    const s = lockReducer(viewer, { type: "lockFreed" });
    expect(s.canTakeOver).toBe(true);
    expect(s.role).toBe("viewer");
  });
  it("lockFreed while editor is a no-op", () => {
    const editor = lockReducer(INITIAL_LOCK_STATE, { type: "acquired" });
    expect(lockReducer(editor, { type: "lockFreed" })).toEqual(editor);
  });
  it("tookOver → editor", () => {
    const viewer = lockReducer(INITIAL_LOCK_STATE, { type: "denied", heldByName: "X" });
    const s = lockReducer(viewer, { type: "tookOver" });
    expect(s.role).toBe("editor");
    expect(canEdit(s)).toBe(true);
  });
});
