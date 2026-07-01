// D33 pure lock state — no React, no DB, so it is fully unit-testable.
export const HEARTBEAT_MS = 15_000;
export const STALE_MS = 45_000;

// A lock is stale when its last heartbeat is older than ttl (or missing/unparseable).
export function isLockStale(
  heartbeatAt: string | null,
  now: number,
  ttl: number = STALE_MS,
): boolean {
  if (!heartbeatAt) return true;
  const t = Date.parse(heartbeatAt);
  if (Number.isNaN(t)) return true;
  return now - t > ttl;
}

export type LockRole = "acquiring" | "editor" | "viewer";
export type LockState = {
  role: LockRole;
  heldByName: string | null;
  canTakeOver: boolean;
};

export const INITIAL_LOCK_STATE: LockState = {
  role: "acquiring",
  heldByName: null,
  canTakeOver: false,
};

export type LockEvent =
  | { type: "acquired" }
  | { type: "denied"; heldByName: string | null }
  | { type: "heartbeatLost" }
  | { type: "tookOver" }
  | { type: "lockFreed" };

export function lockReducer(state: LockState, event: LockEvent): LockState {
  switch (event.type) {
    case "acquired":
    case "tookOver":
      return { role: "editor", heldByName: null, canTakeOver: false };
    case "denied":
      return { role: "viewer", heldByName: event.heldByName, canTakeOver: false };
    case "heartbeatLost":
      return { role: "viewer", heldByName: state.heldByName, canTakeOver: false };
    case "lockFreed":
      // Only a waiting viewer can gain the ability to take over.
      return state.role === "viewer" ? { ...state, canTakeOver: true } : state;
    default:
      return state;
  }
}

export function canEdit(state: LockState): boolean {
  return state.role === "editor";
}
