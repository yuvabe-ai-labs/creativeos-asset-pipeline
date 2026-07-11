import { useSyncExternalStore } from "react";

// A tiny app-wide "can we reach the server?" signal. The lock heartbeat / viewer poll
// (the round-trips that already hit Supabase on an interval) write to it via
// trackConnection; the ConnectionBadge reads it via useConnectionStatus. Keeping it a
// standalone module means writer and reader never have to know about each other.

export type ConnectionStatus = "online" | "offline";

let status: ConnectionStatus = "online";
const listeners = new Set<() => void>();

export function getConnectionStatus(): ConnectionStatus {
  return status;
}

export function subscribeConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setStatus(next: ConnectionStatus) {
  if (status === next) return; // idempotent — don't wake subscribers for a no-op
  status = next;
  for (const listener of listeners) listener();
}

export function markOnline() {
  setStatus("online");
}

export function markOffline() {
  setStatus("offline");
}

// Wrap a best-effort background round-trip (heartbeat, poll, acquire). A success marks
// us online and returns the value; a throw marks us offline, is SWALLOWED (so it never
// bubbles to Next's dev overlay / crashes the worker), and returns null so the caller
// can distinguish "unreachable" from a real domain result.
export async function trackConnection<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    const result = await fn();
    markOnline();
    return result;
  } catch {
    markOffline();
    return null;
  }
}

export function resetConnectionStatusForTest() {
  status = "online";
  listeners.clear();
}

// React hook — subscribes a component to the status. SSR snapshot is always "online".
export function useConnectionStatus(): ConnectionStatus {
  return useSyncExternalStore(subscribeConnection, getConnectionStatus, () => "online");
}

// Pure view-model for the badge: what (if anything) to show given the current status and
// whether we're inside the brief "just reconnected" window. Offline always wins.
export type ConnectionBadgeVariant = "offline" | "reconnected";

export function connectionBadgeView(
  status: ConnectionStatus,
  reconnecting: boolean,
): { visible: boolean; variant: ConnectionBadgeVariant | null } {
  if (status === "offline") return { visible: true, variant: "offline" };
  if (reconnecting) return { visible: true, variant: "reconnected" };
  return { visible: false, variant: null };
}
