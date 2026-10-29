import { describe, expect, it } from "vitest";
import { reconcile } from "../reconcile";
import type { Caption, EditDoc } from "../types";
import { file, source, videoFacts } from "./fixtures";

let n = 0;
const newId = () => `id${++n}`;
const FULL = 121 / 24;

const s1 = source("a", { shotOrder: 1 });
const s2 = source("b", { shotOrder: 2 });
const loose1 = source("x");
const loose2 = source("y");

describe("reconcile", () => {
  it("lays out a first open in shot order, shotless last in connection order", () => {
    const { doc } = reconcile(null, [loose1, s2, loose2, s1], newId);
    expect(doc.pieces.map((p) => p.sourceNodeId)).toEqual(["a", "b", "x", "y"]);
    expect(doc.pieces[0]).toMatchObject({ in: 0, picture: "original", sound: "original" });
    expect(doc.pieces[0].out).toBeCloseTo(FULL, 9);
    expect(doc.shape).toBe("9:16");
    expect(doc.sources).toEqual(expect.arrayContaining([{ nodeId: "a", edgeId: "e-a", versionId: "v-a" }]));
  });

  it("shapes a landscape first clip 16:9", () => {
    const wide = source("w", { facts: videoFacts({ width: 1280, height: 720 }) });
    expect(reconcile(null, [wide], newId).doc.shape).toBe("16:9");
  });

  const base = reconcile(null, [s1, s2], newId).doc;
  const pieceOf = (doc: EditDoc, id: string) => doc.pieces.find((p) => p.sourceNodeId === id)!;

  it("removes a disconnected source with its captions", () => {
    const cap: Caption = { id: "c", pieceId: pieceOf(base, "b").id, at: 0, duration: 1, text: "t" };
    const { doc, notices } = reconcile({ ...base, captions: [cap] }, [s1], newId);
    expect(doc.pieces.map((p) => p.sourceNodeId)).toEqual(["a"]);
    expect(doc.captions).toEqual([]);
    expect(notices).toEqual([{ kind: "removed", sourceNodeId: "b", message: "A source was disconnected, so its pieces left the reel." }]);
  });

  it("brings a reconnected source back fresh", () => {
    const trimmed = { ...base, pieces: base.pieces.map((p) => (p.sourceNodeId === "b" ? { ...p, in: 1, out: 2 } : p)) };
    const { doc } = reconcile(trimmed, [s1, { ...s2, edgeId: "e-b-again" }], newId);
    const bs = doc.pieces.filter((p) => p.sourceNodeId === "b");
    expect(bs).toHaveLength(1);
    expect(bs[0].in).toBe(0);
    expect(bs[0].out).toBeCloseTo(FULL, 9);
    expect(doc.pieces.map((p) => p.sourceNodeId)).toEqual(["a", "b"]);
  });

  it("pulls trims in for a shorter version", () => {
    const trimmed = { ...base, pieces: base.pieces.map((p) => (p.sourceNodeId === "a" ? { ...p, in: 1, out: 4.5 } : p)) };
    const shorter = source("a", { shotOrder: 1, versionId: "v-a2", facts: videoFacts({ frames: 72 }) });
    const { doc, notices } = reconcile(trimmed, [shorter, s2], newId);
    expect(pieceOf(doc, "a").out).toBeCloseTo(3, 9);
    expect(pieceOf(doc, "a").in).toBe(1);
    expect(doc.sources.find((s) => s.nodeId === "a")?.versionId).toBe("v-a2");
    expect(notices).toEqual([{ kind: "trimmed", sourceNodeId: "a", message: "VID-A switched to a shorter version, so its trims were pulled in to fit." }]);
  });

  it("falls back when lip sync or dub disappears", () => {
    const dub = source("d", { kind: "dubbing", handle: "DUB-D" });
    const start = reconcile(null, [dub], newId).doc;
    const chosen = { ...start, pieces: start.pieces.map((p) => ({ ...p, picture: "lipSynced" as const, sound: "dubbed" as const })) };
    const bare = source("d", { kind: "dubbing", handle: "DUB-D", versionId: "v-d2", lipSynced: null, dubAudio: null });
    const { doc, notices } = reconcile(chosen, [bare], newId);
    expect(doc.pieces[0]).toMatchObject({ picture: "original", sound: "original" });
    expect(notices.map((x) => x.message)).toEqual([
      "DUB-D's current version has no lip-synced video, so its pieces show the original picture.",
      "DUB-D's current version has no dub, so its pieces play the original sound.",
    ]);
  });

  it("inserts a new source by shot order into a user-reordered reel", () => {
    const s3 = source("c", { shotOrder: 3 });
    const reordered = { ...base, pieces: [pieceOf(base, "b"), pieceOf(base, "a")] };
    const { doc } = reconcile(reordered, [s1, s2, s3, loose1], newId);
    expect(doc.pieces.map((p) => p.sourceNodeId)).toEqual(["b", "a", "c", "x"]);
    const s0 = source("z", { shotOrder: 2 });
    expect(reconcile(reordered, [s1, s2, s0], newId).doc.pieces.map((p) => p.sourceNodeId)).toEqual(["b", "a", "z"]);
  });

  it("gives an unreadable new source no piece", () => {
    const broken = source("u", { facts: null });
    const { doc, notices } = reconcile(base, [s1, s2, broken], newId);
    expect(doc.pieces.some((p) => p.sourceNodeId === "u")).toBe(false);
    expect(doc.sources.some((s) => s.nodeId === "u")).toBe(false);
    expect(notices).toEqual([{ kind: "unreadable", sourceNodeId: "u", message: "Couldn't read VID-U's clip, so it isn't on the timeline. Reopen the editor to try again." }]);
  });

  it("keeps the pieces of a placed source that has become unreadable", () => {
    const { doc } = reconcile(base, [source("a", { shotOrder: 1, facts: null }), s2], newId);
    expect(doc).toBe(base);
  });

  it("returns prev itself when nothing changed", () => {
    const { doc, notices } = reconcile(base, [s1, s2], newId);
    expect(doc).toBe(base);
    expect(notices).toEqual([]);
  });

  it("keeps a lip-synced picture within its own file's length after a version switch", () => {
    const dub = source("d", { kind: "dubbing" });
    const start = reconcile(null, [dub], newId).doc;
    const lip = { ...start, pieces: start.pieces.map((p) => ({ ...p, picture: "lipSynced" as const })) };
    const shortLip = source("d", { kind: "dubbing", versionId: "v-d2", lipSynced: file("https://storage.googleapis.com/b/d-lip2.mp4", videoFacts({ fps: 25, frames: 100 })) });
    expect(reconcile(lip, [shortLip], newId).doc.pieces[0].out).toBeCloseTo(4, 9);
  });

  it("keeps the pieces of a source still connected but without a take (never deletes on a bad read)", () => {
    const cap: Caption = { id: "c", pieceId: pieceOf(base, "b").id, at: 0, duration: 1, text: "t" };
    const prev = { ...base, captions: [cap] };
    const { doc, notices } = reconcile(prev, [s1], newId, new Map([["a", "e-a"], ["b", "e-b"]]));
    expect(doc).toBe(prev);
    expect(notices).toEqual([]);
    // Reconnected on a new edge, it still goes.
    expect(reconcile(prev, [s1], newId, new Map([["a", "e-a"], ["b", "e-b2"]])).doc.pieces.map((p) => p.sourceNodeId)).toEqual(["a"]);
  });
});
