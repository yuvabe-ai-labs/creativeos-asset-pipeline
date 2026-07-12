import { describe, it, expect } from "vitest";
import { placeNewNode, buildHistory, resolveScriptTarget, resolveNodeTarget, fileNameToTitle, scriptCreatedMessage } from "./actions";
import { expandSelected } from "./actions";
import { nodeHandle } from "@/lib/nodes/describe-node";
import type { AppNode } from "@/lib/canvas-nodes";

let seq = 0;
const nodeAt = (x: number, y: number): AppNode =>
  ({ id: `n${seq++}`, type: "text", position: { x, y }, data: {} }) as AppNode;

describe("placeNewNode", () => {
  it("drops the first node at a fixed spot on an empty canvas", () => {
    expect(placeNewNode([])).toEqual({ x: 240, y: 200 });
  });

  it("places the new node just right of a single node, on the same row", () => {
    expect(placeNewNode([nodeAt(100, 50)])).toEqual({ x: 460, y: 50 });
  });

  it("places to the right of the RIGHTMOST node, inheriting its row", () => {
    const nodes = [nodeAt(100, 50), nodeAt(800, 300), nodeAt(400, 900)];
    expect(placeNewNode(nodes)).toEqual({ x: 1160, y: 300 });
  });
});

describe("buildHistory", () => {
  it("appends the new user message and drops empty / placeholder turns", () => {
    const prior = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "" }, // streaming placeholder → dropped
      { role: "assistant" as const, content: "Created a Script node. Parse it?" },
    ];
    expect(buildHistory(prior, "yes")).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Created a Script node. Parse it?" },
      { role: "user", content: "yes" },
    ]);
  });
});

describe("resolveScriptTarget", () => {
  const scriptNode = (id: string): AppNode =>
    ({ id, type: "script", position: { x: 0, y: 0 }, data: {} }) as AppNode;
  const textNode = (id: string): AppNode =>
    ({ id, type: "text", position: { x: 0, y: 0 }, data: {} }) as AppNode;

  it("returns null when there is no Script node", () => {
    expect(resolveScriptTarget([textNode("t1")])).toBeNull();
  });

  it("returns the most-recently-added Script node when no handle is given", () => {
    const nodes = [scriptNode("s1"), textNode("t1"), scriptNode("s2")];
    expect(resolveScriptTarget(nodes)?.id).toBe("s2");
  });

  it("returns the Script node whose handle the model named", () => {
    const nodes = [
      scriptNode("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
      scriptNode("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
    ];
    const h = nodeHandle({ id: nodes[0].id, type: "script" });
    expect(resolveScriptTarget(nodes, h)?.id).toBe(nodes[0].id);
  });
});

describe("resolveNodeTarget", () => {
  const node = (id: string, type: string): AppNode =>
    ({ id, type, position: { x: 0, y: 0 }, data: {} }) as AppNode;

  it("resolves ANY node type by its handle (case-insensitive)", () => {
    const nodes = [
      node("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "shot"),
      node("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "prompt"),
    ];
    const h = nodeHandle({ id: nodes[0].id, type: "shot" });
    expect(resolveNodeTarget(nodes, h.toLowerCase())?.id).toBe(nodes[0].id);
  });

  it("returns null when no node matches the handle (no 'most recent' fallback)", () => {
    expect(resolveNodeTarget([node("n1", "shot")], "SHOT-XXXX")).toBeNull();
  });
});

describe("fileNameToTitle", () => {
  it("strips the extension, de-dashes/underscores, and title-cases", () => {
    expect(fileNameToTitle("prakriti-reel.md")).toBe("Prakriti Reel");
    expect(fileNameToTitle("my_script.txt")).toBe("My Script");
    expect(fileNameToTitle("notes")).toBe("Notes");
    expect(fileNameToTitle("")).toBe("");
  });
});

describe("scriptCreatedMessage", () => {
  it("includes the handle so the model can target THIS node on 'yes'", () => {
    const msg = scriptCreatedMessage("SCR-7C2A", "One Script");
    expect(msg).toContain("SCR-7C2A");
    expect(msg).toContain("One Script");
    expect(msg.toLowerCase()).toContain("parse");
  });

  it("still includes the handle when there is no title", () => {
    expect(scriptCreatedMessage("SCR-7C2A")).toContain("SCR-7C2A");
  });
});

const node = (id: string, type: string, selected: boolean, title?: string) =>
  ({ id, type, position: { x: 0, y: 0 }, data: title ? { title } : {}, selected }) as never;

describe("expandSelected", () => {
  it("returns empty string when nothing is selected", () => {
    expect(expandSelected([node("a1b2c3d4", "file", false)])).toBe("");
  });
  it("expands one selected node to its @HANDLE name token with trailing space", () => {
    expect(expandSelected([node("a1b2c3d4", "file", true, "Hero")])).toBe("@FILE-A1B2 Hero ");
  });
  it("space-joins multiple selected nodes", () => {
    const out = expandSelected([
      node("a1b2c3d4", "file", true, "Hero"),
      node("e5f6a7b8", "prompt", true),
      node("c9d0e1f2", "shot", false),
    ]);
    expect(out).toBe("@FILE-A1B2 Hero @PRM-E5F6 untitled prompt ");
  });
});
