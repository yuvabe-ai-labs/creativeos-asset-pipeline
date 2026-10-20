// Brings a saved edit up to date with the Editor's current sources (spec §4, D389/D390):
// - a disconnected or reconnected source loses its pieces; a reconnected one comes back fresh;
// - a version switch keeps trims by time, pulled in to a shorter take, and falls back to the
//   original picture or sound when the new version lacks lip sync or a dub;
// - a new source gets one full-length piece at its shot position.
// Returns `prev` itself when nothing changes, so opening the editor never writes a no-op.
import type { EditDoc, EditorNotice, EditSource, Piece, ReelShape, SourceView } from "./types";

const EPS = 1e-9;

/** The chosen picture file's length and frame rate; null when it couldn't be read. */
export function pieceLimit(piece: Piece, source: SourceView): { duration: number; fps: number } | null {
  const file = piece.picture === "lipSynced" && source.files.lipSynced ? source.files.lipSynced : source.files.original;
  const video = file.facts?.video;
  return video ? { duration: video.frames / video.fps, fps: video.fps } : null;
}

const orderKey = (s: SourceView | undefined) => s?.shotOrder ?? Number.POSITIVE_INFINITY;

function freshPiece(source: SourceView, id: string): Piece | null {
  const video = source.files.original.facts?.video;
  if (!video) return null;
  return { id, sourceNodeId: source.nodeId, in: 0, out: video.frames / video.fps, picture: "original", sound: "original" };
}

function shapeOf(source: SourceView | undefined): ReelShape {
  const v = source?.files.original.facts?.video;
  return v && v.width > v.height ? "16:9" : "9:16";
}

/** `connected`: every source node still wired to the Editor, by edge id, including ones with no
 *  readable take right now. Their pieces are kept: a missing take is never read as "disconnected"
 *  (rule 13), so a bad read can't delete trims and captions. */
export function reconcile(
  prev: EditDoc | null,
  sources: SourceView[],
  newId: () => string,
  connected: Map<string, string> = new Map(sources.map((s) => [s.nodeId, s.edgeId])),
): { doc: EditDoc; notices: EditorNotice[] } {
  const notices: EditorNotice[] = [];
  const current = new Map(sources.map((s) => [s.nodeId, s]));
  let changed = prev === null;
  let pieces = prev?.pieces ?? [];
  let captions = prev?.captions ?? [];
  const kept: EditSource[] = [];
  const waiting: EditSource[] = [];

  // 1. Sources that left, or came back on a new edge.
  for (const saved of prev?.sources ?? []) {
    const now = current.get(saved.nodeId);
    if (now && now.edgeId === saved.edgeId) {
      kept.push(saved);
      continue;
    }
    if (!now && connected.get(saved.nodeId) === saved.edgeId) {
      waiting.push(saved); // still wired, take unreadable: leave its pieces alone
      continue;
    }
    changed = true;
    const gone = new Set(pieces.filter((p) => p.sourceNodeId === saved.nodeId).map((p) => p.id));
    pieces = pieces.filter((p) => !gone.has(p.id));
    captions = captions.filter((c) => !gone.has(c.pieceId));
    if (!now) notices.push({ kind: "removed", sourceNodeId: saved.nodeId, message: "A source was disconnected, so its pieces left the reel." });
  }

  // 2. Version switches.
  const sourcesOut = kept.map((saved) => {
    const now = current.get(saved.nodeId)!;
    if (now.versionId === saved.versionId) return saved;
    changed = true;
    let trimmed = false;
    let pictureFell = false;
    let soundFell = false;
    pieces = pieces.map((p) => {
      if (p.sourceNodeId !== now.nodeId) return p;
      let next = p;
      if (next.picture === "lipSynced" && !now.files.lipSynced) {
        next = { ...next, picture: "original" };
        pictureFell = true;
      }
      if (next.sound === "dubbed" && !now.files.dubAudio) {
        next = { ...next, sound: "original" };
        soundFell = true;
      }
      const limit = pieceLimit(next, now);
      if (limit && next.out > limit.duration + EPS) {
        const out = limit.duration;
        next = { ...next, out, in: Math.min(next.in, out - 1 / limit.fps) };
        trimmed = true;
      }
      return next;
    });
    if (trimmed) notices.push({ kind: "trimmed", sourceNodeId: now.nodeId, message: `${now.handle} switched to a shorter version, so its trims were pulled in to fit.` });
    if (pictureFell) notices.push({ kind: "picture-fallback", sourceNodeId: now.nodeId, message: `${now.handle}'s current version has no lip-synced video, so its pieces show the original picture.` });
    if (soundFell) notices.push({ kind: "sound-fallback", sourceNodeId: now.nodeId, message: `${now.handle}'s current version has no dub, so its pieces play the original sound.` });
    return { ...saved, versionId: now.versionId };
  });

  sourcesOut.push(...waiting);

  // 3. New sources: one full-length piece each, by shot order (first open: shot order throughout).
  const known = new Set(sourcesOut.map((s) => s.nodeId));
  const incoming = sources.filter((s) => !known.has(s.nodeId));
  const ordered = prev === null ? [...incoming].sort((a, b) => orderKey(a) - orderKey(b)) : incoming;
  for (const s of ordered) {
    const piece = freshPiece(s, newId());
    if (!piece) {
      notices.push({ kind: "unreadable", sourceNodeId: s.nodeId, message: `Couldn't read ${s.handle}'s clip, so it isn't on the timeline. Reopen the editor to try again.` });
      continue;
    }
    changed = true;
    sourcesOut.push({ nodeId: s.nodeId, edgeId: s.edgeId, versionId: s.versionId });
    if (prev === null || s.shotOrder === null) {
      pieces = [...pieces, piece];
      continue;
    }
    const at = pieces.findIndex((p) => orderKey(current.get(p.sourceNodeId)) > s.shotOrder!);
    pieces = at < 0 ? [...pieces, piece] : [...pieces.slice(0, at), piece, ...pieces.slice(at)];
  }

  if (!changed && prev) return { doc: prev, notices };
  const shape = prev?.shape ?? shapeOf(current.get(pieces[0]?.sourceNodeId ?? ""));
  return { doc: { v: 1, shape, sources: sourcesOut, pieces, captions }, notices };
}
