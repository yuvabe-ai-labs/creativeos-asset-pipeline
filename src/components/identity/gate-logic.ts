import type { Identity } from "@/lib/identity";

// True when the app-start gate must block (no identity chosen yet).
//
// `hydrated` guards the SSR/first-render window: `identity` is `null` both while
// we're still reading localStorage AND when it's genuinely empty. Gating on the
// former opened the dialog for a single render, then closed it once localStorage
// loaded — a flash the Base UI dialog couldn't survive (it mounted "open" after
// the close and got stranded). Only gate once we've actually checked (D29/D33).
export function needsIdentityGate(
  identity: Identity | null,
  hydrated: boolean,
): boolean {
  return hydrated && identity === null;
}
