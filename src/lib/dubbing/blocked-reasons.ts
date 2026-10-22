// Why a Dubbing control is off, shown as its tooltip on hover. Null = it is on (or nothing to say
// yet, e.g. the take's length is still loading). Plain words; no vendor names.
import { DUB_NO_LENGTH_MESSAGE } from "./copy";

const READ_ONLY = "You can view this canvas but not change it.";

export function dubBlockedReason(a: {
  editable: boolean;
  running: "dub" | "lipsync" | null;
  hasSource: boolean;
  sourceLoading: boolean;
  sourceSeconds: number;
  /** D390 — why generation is locked (it feeds the Editor), or null. */
  locked?: string | null;
}): string | null {
  if (!a.editable) return READ_ONLY;
  if (a.locked) return a.locked;
  if (a.running === "dub") return "A dub is already running.";
  if (a.running === "lipsync") return "Wait for lip sync to finish.";
  if (!a.hasSource) return "Connect a video to dub first.";
  if (a.sourceLoading) return null;
  if (a.sourceSeconds <= 0) return DUB_NO_LENGTH_MESSAGE;
  return null;
}

export const LIP_SYNC_NEEDS_DUB = "Make a dub first. Lip sync matches the mouth to a dubbed voice.";

export function lipSyncBlockedReason(a: {
  editable: boolean;
  running: "dub" | "lipsync" | null;
  hasDub: boolean;
  dubSeconds: number;
  locked?: string | null;
}): string | null {
  if (!a.editable) return READ_ONLY;
  if (a.locked) return a.locked;
  if (a.running === "lipsync") return "Lip sync is already running.";
  if (a.running === "dub") return "Wait for the dub to finish.";
  if (!a.hasDub) return LIP_SYNC_NEEDS_DUB;
  if (a.dubSeconds <= 0) return "This dub has no recorded length, so it can't be priced.";
  return null;
}
