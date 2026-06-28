import { describe, it, expect } from "vitest";
import { renderComposeContext, selectImageUpstreams } from "@/lib/nodes/shot-compose";
import { getShotRole } from "@/lib/nodes/shot-roles";

describe("renderComposeContext", () => {
  const role = getShotRole("application");

  it("includes the seed, role label, every slot and avoid, and KB context", () => {
    const out = renderComposeContext({
      seedText: "Fingertip traces a line of cream on forearm.\nMedium: AI macro",
      role,
      clientContext: "Avoid words: cure, heal\nTone of voice: calm",
    });
    expect(out).toContain("Fingertip traces a line of cream on forearm.");
    expect(out).toContain("Medium: AI macro");
    expect(out).toContain("Application");
    for (const s of role.slots) expect(out).toContain(s);
    for (const a of role.avoid) expect(out).toContain(a);
    expect(out).toContain("Avoid words: cure, heal");
  });

  it("omits the Brand context block when KB context is empty", () => {
    const out = renderComposeContext({ seedText: "x", role, clientContext: "  " });
    expect(out).not.toContain("Brand context");
  });
});

describe("selectImageUpstreams", () => {
  it("picks image-gen + file/draw images and IGNORES the script lineage edge", () => {
    const out = selectImageUpstreams([
      // the dashed Script->Shot lineage edge — must be ignored
      { nodeId: "s1", type: "script", data: {}, activeOutput: { title: "reel" }, versionId: "v0" },
      { nodeId: "g1", type: "image-gen", data: {}, activeOutput: "https://x/img.png", versionId: "v1" },
      { nodeId: "f1", type: "file", data: { fileKind: "image", fileUrl: "https://x/f.png", useLlm: false }, activeOutput: null, versionId: null },
      { nodeId: "d1", type: "draw", data: { fileKind: "image", fileUrl: "https://x/d.png" }, activeOutput: null, versionId: null },
    ]);
    expect(out.map((u) => u.nodeId)).toEqual(["g1", "f1", "d1"]);
    expect(out.every((u) => typeof u.fileUrl === "string")).toBe(true);
  });

  it("excludes a file in extraction-only mode (useLlm) and non-image files", () => {
    const out = selectImageUpstreams([
      { nodeId: "f2", type: "file", data: { fileKind: "image", fileUrl: "https://x/f.png", useLlm: true }, activeOutput: null, versionId: null },
      { nodeId: "f3", type: "file", data: { fileKind: "text", rawText: "hi" }, activeOutput: null, versionId: null },
      { nodeId: "g2", type: "image-gen", data: {}, activeOutput: null, versionId: "v9" },
    ]);
    expect(out).toEqual([]);
  });
});
