import { describe, expect, it } from "vitest";
import { computeGenerationLocks, editorSourceCount, GENERATION_LOCK_COPY } from "../generation-lock";

const n = (id: string, type: string) => ({ id, type });
const e = (source: string, target: string) => ({ source, target });

describe("computeGenerationLocks", () => {
  it("locks a Video Gen that feeds the Editor", () => {
    expect(computeGenerationLocks([n("vg", "video-gen"), n("ed", "editor")], [e("vg", "ed")])).toEqual({ vg: "editor" });
  });

  it("locks a dub that feeds the Editor, and the video behind it", () => {
    const nodes = [n("vg", "video-gen"), n("dub", "dubbing"), n("ed", "editor")];
    expect(computeGenerationLocks(nodes, [e("vg", "dub"), e("dub", "ed")])).toEqual({ vg: "dub", dub: "editor" });
  });

  it("locks nothing without an Editor", () => {
    expect(computeGenerationLocks([n("vg", "video-gen"), n("dub", "dubbing")], [e("vg", "dub")])).toEqual({});
  });

  it("never locks further upstream", () => {
    const nodes = [n("p", "video-prompt"), n("vg", "video-gen"), n("ed", "editor")];
    expect(computeGenerationLocks(nodes, [e("p", "vg"), e("vg", "ed")])).toEqual({ vg: "editor" });
  });

  it("prefers the direct lock when a video feeds the Editor both ways", () => {
    const nodes = [n("vg", "video-gen"), n("dub", "dubbing"), n("ed", "editor")];
    expect(computeGenerationLocks(nodes, [e("vg", "dub"), e("dub", "ed"), e("vg", "ed")]).vg).toBe("editor");
  });

  it("says why, in place of the action", () => {
    expect(GENERATION_LOCK_COPY.editor.short).toBe("In use by the Editor · Disconnect to generate");
    expect(GENERATION_LOCK_COPY.dub.short).toBe("Locked by its dub · feeds the Editor");
  });

  it("counts the Editor's sources from the index (the card refreshes when it changes)", () => {
    const nodes = [n("vg", "video-gen"), n("vg2", "video-gen"), n("dub", "dubbing"), n("ed", "editor")];
    expect(editorSourceCount(computeGenerationLocks(nodes, [e("vg", "dub"), e("dub", "ed"), e("vg2", "ed")]))).toBe(2);
    expect(editorSourceCount({})).toBe(0);
  });
});
