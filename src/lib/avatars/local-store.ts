// Client avatars, kept in this browser's localStorage per client. A stand-in until avatars get a
// backend: nothing here leaves the browser, and a different browser sees none of them.
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

export type SavedAvatar = {
  id: string;
  name: string;
  /** Downscaled JPEG data URL — see src/lib/avatars/image.ts. Empty for placeholder avatars. */
  imageDataUrl: string;
  voice: PickerVoice | null;
  /** Set only on random (AI-described) characters; they reopen in the random editor. */
  description?: string;
  updatedAt: number;
};

const EMPTY: SavedAvatar[] = [];

// Placeholder avatars, appended to a client's list until its first write. That write stores
// them along with the change (and sets the seeded flag), so from then on they are edited or
// deleted like real ones and never come back.
const dummy = (id: string, name: string): SavedAvatar => ({ id, name, imageDataUrl: "", voice: null, updatedAt: 0 });
const DUMMY_AVATARS: SavedAvatar[] = [
  dummy("dummy-priya", "Priya"),
  dummy("dummy-arjun", "Arjun"),
  dummy("dummy-meera", "Meera"),
  dummy("dummy-rahul", "Rahul"),
  dummy("dummy-ananya", "Ananya"),
];
const keyFor = (clientId: string) => `creativeos:avatars:${clientId}`;
const seededKeyFor = (clientId: string) => `creativeos:avatars-seeded:${clientId}`;
const listeners = new Set<() => void>();
// Parsed lists cached by what they were built from, so useSyncExternalStore gets a stable snapshot.
const cache = new Map<string, { raw: string | null; seeded: boolean; list: SavedAvatar[] }>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getAvatars(clientId: string): SavedAvatar[] {
  const raw = read(keyFor(clientId));
  const seeded = read(seededKeyFor(clientId)) !== null;
  const hit = cache.get(clientId);
  if (hit && hit.raw === raw && hit.seeded === seeded) return hit.list;
  let stored = EMPTY;
  try {
    if (raw) stored = JSON.parse(raw) as SavedAvatar[];
  } catch {
    stored = EMPTY;
  }
  const list = seeded ? stored : [...stored, ...DUMMY_AVATARS];
  cache.set(clientId, { raw, seeded, list });
  return list;
}

function write(clientId: string, list: SavedAvatar[]) {
  try {
    localStorage.setItem(keyFor(clientId), JSON.stringify(list));
    localStorage.setItem(seededKeyFor(clientId), "1");
  } catch {
    throw new Error("Couldn't save: this browser's storage is full.");
  }
  listeners.forEach((l) => l());
}

export function upsertAvatar(clientId: string, avatar: SavedAvatar) {
  const list = getAvatars(clientId);
  const exists = list.some((a) => a.id === avatar.id);
  write(clientId, exists ? list.map((a) => (a.id === avatar.id ? avatar : a)) : [avatar, ...list]);
}

export function removeAvatar(clientId: string, id: string) {
  write(clientId, getAvatars(clientId).filter((a) => a.id !== id));
}

export function subscribeAvatars(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
