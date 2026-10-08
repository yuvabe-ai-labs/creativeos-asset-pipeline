import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import type { Avatar } from "@/lib/avatars/schema";
import { avatarSheetId } from "@/lib/video-gen/select-references";
import { compositeUpstreamItems, compositeMentionUpstream, compositeMentionables, compositePreviewOf } from "../upstream-items";

const node = (id: string, type: string, data: Record<string, unknown>) =>
  ({ id, type, position: { x: 0, y: 0 }, data }) as unknown as AppNode;
const edge = (source: string): Edge => ({ id: `${source}-c`, source, target: "c" });

const NODES = [
  node("c", "composite", {}),
  node("av", "avatar", { avatarId: "a1" }),
  node("f", "file", { filename: "Sandals.png", fileKind: "image", fileUrl: "https://cdn/s.png" }),
  node("g", "image-gen", { title: "Hero", parsed: "https://cdn/g.png" }),
  node("o", "composite", { title: "Office sheet", parsed: "https://cdn/o.png" }),
  node("d", "draw", { fileUrl: "https://cdn/d.png" }),
];
const EDGES = ["av", "f", "g", "o", "d"].map(edge);
const AVATARS = [
  { id: "a1", name: "Riya", front: { url: "https://cdn/front.png" }, sheet: { url: "https://cdn/sheet.png" }, sheetStale: false } as unknown as Avatar,
];

describe("compositeUpstreamItems (D312)", () => {
  it("lists every wired input with a name and its image", () => {
    const items = compositeUpstreamItems("c", NODES, EDGES, AVATARS);
    expect(items.map((i) => [i.type, i.label, i.fileUrl])).toEqual([
      ["avatar", "Riya", "https://cdn/front.png"],
      ["file", "Sandals.png", "https://cdn/s.png"],
      ["image-gen", "Hero", "https://cdn/g.png"],
      ["composite", "Office sheet", "https://cdn/o.png"],
      ["draw", "Sketch", "https://cdn/d.png"],
    ]);
  });

  it("names an avatar it cannot find yet 'Avatar'", () => {
    const [item] = compositeUpstreamItems("c", NODES, [edge("av")], []);
    expect(item).toMatchObject({ type: "avatar", label: "Avatar", fileUrl: undefined });
  });
});

describe("compositeMentionUpstream / compositeMentionables", () => {
  it("offers only inputs that carry an image — the server roster sends nothing else", () => {
    const nodes = [
      ...NODES,
      node("pdf", "file", { filename: "brief.pdf", fileKind: "document", fileUrl: "https://cdn/brief.pdf" }),
      node("empty", "image-gen", { title: "Not yet" }),
    ];
    const items = compositeUpstreamItems("c", nodes, [edge("pdf"), edge("empty"), edge("f")], AVATARS);
    expect(items.map((i) => i.id)).toEqual(["pdf", "empty", "f"]); // the rail still lists them
    expect(compositeMentionUpstream(items).map((m) => m.id)).toEqual(["f"]);
  });

  it("offers every wired input by @ — the avatar's front and sheet as D308 does, composites included", () => {
    const mention = compositeMentionUpstream(compositeUpstreamItems("c", NODES, EDGES, AVATARS));
    expect(mention.map((m) => m.id)).toEqual(["av", avatarSheetId("av"), "f", "g", "o", "d"]);
    expect(compositeMentionables(mention).map((m) => m.label)).toEqual([
      "Avatar: Riya",
      "Avatar: Riya sheet",
      "File: Sandals.png",
      "Image: Hero",
      "Composite: Office sheet",
      "Sketch: Sketch",
    ]);
  });

  // D320 — a wired script or multishot is offered whole and shot by shot, with no image.
  it("offers a wired multishot and each of its shots as context", () => {
    const nodes = [
      ...NODES,
      node("m", "multishot", { title: "Morning reel", cuts: [{ id: "c1", text: "She wakes up.", seconds: 3 }, { id: "c2", text: "Coffee pour.", seconds: 2 }] }),
    ];
    const items = compositeUpstreamItems("c", nodes, [edge("f"), edge("m")], AVATARS);
    expect(items.find((i) => i.id === "m")).toMatchObject({ type: "multishot", label: "Morning reel" });
    const mention = compositeMentionUpstream(items);
    expect(mention.map((m) => m.id)).toEqual(["f"]);
    expect(compositeMentionables(mention, items).map((m) => [m.id, m.label])).toEqual([
      ["f", "File: Sandals.png"],
      ["m", "Multishot: Morning reel"],
      ["m:shot:c1", "Shot: Morning reel · Shot 1"],
      ["m:shot:c2", "Shot: Morning reel · Shot 2"],
    ]);
  });

  it("previews an image input by its picture and a multishot by the shots the composite reads", () => {
    const nodes = [...NODES, node("m", "multishot", { title: "Morning reel", cuts: [{ id: "c1", text: "She wakes up.", seconds: 3 }] })];
    const items = compositeUpstreamItems("c", nodes, [edge("av"), edge("m")], AVATARS);
    expect(compositePreviewOf(items[0])).toMatchObject({ type: "avatar", label: "Riya", fileUrl: "https://cdn/front.png", text: "" });
    expect(compositePreviewOf(items[1])).toMatchObject({ type: "multishot", label: "Morning reel", text: "Shot 1 (3s): She wakes up." });
  });

  it("offers no sheet chip for a stale sheet", () => {
    const stale = [{ ...AVATARS[0], sheetStale: true } as Avatar];
    const mention = compositeMentionUpstream(compositeUpstreamItems("c", NODES, [edge("av")], stale));
    expect(mention.map((m) => m.id)).toEqual(["av"]);
  });
});
