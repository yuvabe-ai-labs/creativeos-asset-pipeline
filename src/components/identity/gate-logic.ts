import type { Identity } from "@/lib/identity";

// True when the app-start gate must block (no identity chosen yet).
export function needsIdentityGate(identity: Identity | null): boolean {
  return identity === null;
}
