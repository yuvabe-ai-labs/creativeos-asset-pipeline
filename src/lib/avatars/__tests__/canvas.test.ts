import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import {
  avatarVoiceLine, parseAvatarDragPayload, presenterAvatarId, presenterEdge, replacedPresenterEdges,
} from "../canvas";

const nodes = [
  { id: "s", type: "script", position: { x: 0, y: 0 }, data: {} },
  { id: "s2", type: "script", position: { x: 0, y: 0 }, data: {} },
  { id: "v1", type: "avatar", position: { x: 0, y: 0 }, data: { avatarId: "a1" } },
  { id: "v2", type: "avatar", position: { x: 0, y: 0 }, data: { avatarId: "a2" } },
  { id: "f", type: "file", position: { x: 0, y: 0 }, data: { title: "" } },
] as AppNode[];
const edge = (id: string, source: string, target: string) => ({ id, source, target }) as Edge;

describe("parseAvatarDragPayload", () => {
  it("reads an avatar id", () => {
    expect(parseAvatarDragPayload('{"avatarId":"a1"}')).toEqual({ avatarId: "a1" });
  });
  it("ignores anything else — a gallery image, an empty id, broken JSON", () => {
    expect(parseAvatarDragPayload("not json")).toBeNull();
    expect(parseAvatarDragPayload('{"images":[]}')).toBeNull();
    expect(parseAvatarDragPayload('{"avatarId":""}')).toBeNull();
    expect(parseAvatarDragPayload('{"avatarId":7}')).toBeNull();
  });
});

describe("presenterEdge", () => {
  it("is the newest avatar edge into the script — the last one added", () => {
    const edges = [edge("e1", "v1", "s"), edge("e2", "f", "s"), edge("e3", "v2", "s")];
    expect(presenterEdge("s", nodes, edges)?.id).toBe("e3");
    expect(presenterAvatarId("s", nodes, edges)).toBe("a2");
  });
  it("ignores edges from other node types and into other scripts", () => {
    const edges = [edge("e1", "f", "s"), edge("e2", "v1", "s2")];
    expect(presenterEdge("s", nodes, edges)).toBeNull();
    expect(presenterAvatarId("s", nodes, edges)).toBeNull();
  });
});

describe("replacedPresenterEdges", () => {
  it("returns the script's other avatar edges when another avatar connects", () => {
    const edges = [edge("e1", "v1", "s"), edge("e2", "f", "s")];
    expect(replacedPresenterEdges(nodes, edges, "v2", "s").map((e) => e.id)).toEqual(["e1"]);
  });
  it("leaves other scripts' presenters alone", () => {
    const edges = [edge("e1", "v1", "s2")];
    expect(replacedPresenterEdges(nodes, edges, "v2", "s")).toEqual([]);
  });
  it("replaces nothing when the connection is not avatar → script", () => {
    const edges = [edge("e1", "v1", "s")];
    expect(replacedPresenterEdges(nodes, edges, "f", "s")).toEqual([]);
  });
  it("does not count the same avatar re-connecting as a replacement", () => {
    const edges = [edge("e1", "v1", "s")];
    expect(replacedPresenterEdges(nodes, edges, "v1", "s")).toEqual([]);
  });
});

describe("avatarVoiceLine", () => {
  it("names the voice the avatar speaks with", () => {
    expect(avatarVoiceLine(null)).toBe("No voice");
    expect(avatarVoiceLine({ mode: "native" })).toBe("Chosen for me");
    expect(avatarVoiceLine({ mode: "named", voiceId: "x", name: "Surabhi", labels: {}, previewUrl: null })).toBe("Surabhi");
  });
});
