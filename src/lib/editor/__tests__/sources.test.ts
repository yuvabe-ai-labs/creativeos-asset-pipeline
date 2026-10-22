import { describe, expect, it } from "vitest";
import { shotOrderOf } from "../shot-order";
import { attachFacts, sourceDrafts } from "../sources";
import { edge, node, videoFacts } from "./fixtures";

const dubOutput = { language: "hi-IN", original: "https://s/o.mp4", dubbed: "https://s/d.mp4", dubbedAudio: "https://s/d.wav", lipSynced: "https://s/l.mp4" };

describe("shotOrderOf", () => {
  const nodes = [
    node("shot2", "shot", { order: 2 }),
    node("vp", "video-prompt"),
    node("vg", "video-gen", { parsed: "https://s/vg.mp4" }),
    node("dub", "dubbing", { parsed: dubOutput }),
    node("ms", "multishot", { order: 1 }),
    node("msp", "multishot-prompt"),
    node("vg2", "video-gen"),
    node("lone", "video-gen"),
  ];
  const edges = [edge("shot2", "vp"), edge("vp", "vg"), edge("vg", "dub"), edge("ms", "msp"), edge("msp", "vg2")];

  it("reads the shot a Video Gen came from", () => {
    expect(shotOrderOf("vg", nodes, edges)).toEqual({ order: 2, label: "Shot 2" });
  });
  it("reads a Dubbing node's shot through its video", () => {
    expect(shotOrderOf("dub", nodes, edges)).toEqual({ order: 2, label: "Shot 2" });
  });
  it("reads a multishot", () => {
    expect(shotOrderOf("vg2", nodes, edges).order).toBe(1);
  });
  it("has no shot for a lone clip", () => {
    expect(shotOrderOf("lone", nodes, edges)).toEqual({ order: null, label: null });
  });
});

describe("sourceDrafts", () => {
  const nodes = [
    node("ed", "editor"),
    node("vgA", "video-gen", { parsed: "https://s/a.mp4" }),
    node("vgB", "video-gen", { parsed: "https://s/b.mp4" }),
    node("vgNone", "video-gen", {}),
    node("dub", "dubbing", { parsed: dubOutput }),
  ];
  const incoming = [
    { id: "e2", sourceNodeId: "vgB", createdAt: "2026-10-20T10:02:00Z" },
    { id: "e1", sourceNodeId: "vgA", createdAt: "2026-10-20T10:01:00Z" },
    { id: "e3", sourceNodeId: "vgNone", createdAt: "2026-10-20T10:03:00Z" },
    { id: "e4", sourceNodeId: "dub", createdAt: "2026-10-20T10:04:00Z" },
  ];
  const run = () => sourceDrafts({ incoming, nodes, edges: [], activeVersionOf: (id) => `v-${id}` });

  it("takes sources in connection order", () => {
    expect(run().drafts.map((d) => d.nodeId)).toEqual(["vgA", "vgB", "dub"]);
  });
  it("skips a take-less source with a notice", () => {
    expect(run().notices).toEqual([
      { kind: "no-take", sourceNodeId: "vgNone", message: "VID-VGNO has no finished take yet, so it isn't on the timeline." },
    ]);
  });
  it("maps a Dubbing node's files", () => {
    const dub = run().drafts.find((d) => d.nodeId === "dub")!;
    expect(dub.urls).toEqual({ original: "https://s/o.mp4", lipSynced: "https://s/l.mp4", dubAudio: "https://s/d.wav" });
    expect(dub).toMatchObject({ kind: "dubbing", language: "hi-IN", edgeId: "e4", versionId: "v-dub" });
  });
  it("plays a Dubbing node's input video until it has a dub (D407)", () => {
    const fresh = [...nodes, node("vgC", "video-gen", { parsed: "https://s/c.mp4" }), node("dubNew", "dubbing", {})];
    const r = sourceDrafts({
      incoming: [{ id: "e9", sourceNodeId: "dubNew", createdAt: "2026-10-23T10:00:00Z" }],
      nodes: fresh,
      edges: [edge("vgC", "dubNew")],
      activeVersionOf: (id) => (id === "dubNew" ? null : `v-${id}`),
    });
    expect(r.notices).toEqual([]);
    expect(r.drafts[0]).toMatchObject({ nodeId: "dubNew", kind: "dubbing", versionId: "input:v-vgC", language: null, urls: { original: "https://s/c.mp4", lipSynced: null, dubAudio: null } });
  });

  it("skips a Dubbing node with no dub and no input take", () => {
    const r = sourceDrafts({ incoming: [{ id: "e9", sourceNodeId: "dubNew", createdAt: "x" }], nodes: [node("dubNew", "dubbing", {})], edges: [], activeVersionOf: () => null });
    expect(r.drafts).toEqual([]);
    expect(r.notices[0]).toMatchObject({ kind: "no-take", sourceNodeId: "dubNew" });
  });

  it("attaches measured facts, null where unreadable", () => {
    const views = attachFacts(run().drafts, new Map([["https://s/a.mp4", videoFacts()], ["https://s/b.mp4", null]]));
    expect(views[0].files.original.facts?.video?.fps).toBe(24);
    expect(views[1].files.original.facts).toBeNull();
  });
});
