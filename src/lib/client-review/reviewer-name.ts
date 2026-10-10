import { REVIEWER_NAME_KEY, REVIEWER_NAME_MAX } from "./constants";

// The client's typed name, kept in localStorage so a returning reviewer isn't asked
// again (spec §4). Every access is guarded: private modes and some in-app webviews
// throw on storage. Pure + injectable so it is testable in the node test env.

export type NameStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function browserStore(): NameStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readReviewerName(store: NameStore | null): string | null {
  try {
    const value = store?.getItem(REVIEWER_NAME_KEY)?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

// Returns the name to use for this visit even when it can't be persisted.
export function saveReviewerName(store: NameStore | null, name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > REVIEWER_NAME_MAX) return null;
  try {
    store?.setItem(REVIEWER_NAME_KEY, trimmed);
  } catch {
    // Not persisted — the prompt returns next visit (spec §6).
  }
  return trimmed;
}

export function clearReviewerName(store: NameStore | null): void {
  try {
    store?.removeItem(REVIEWER_NAME_KEY);
  } catch {
    // Nothing to clear.
  }
}

// Runs inline, before first paint (the next-themes pattern), so a returning reviewer
// never sees the name screen flash. It marks its PARENT (the page wrapper), not <html>,
// which belongs to the shared root layout. Must stay dependency-free: it is a string.
export const PREPAINT_SCRIPT = `try{var n=localStorage.getItem(${JSON.stringify(
  REVIEWER_NAME_KEY,
)});if(n&&n.trim())document.currentScript.parentElement.dataset.reviewer="known"}catch(e){}`;
