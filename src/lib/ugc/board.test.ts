import { describe, expect, it } from "vitest";
import { duplicateRow, newRow, newTile, runnableTiles } from "./board";

describe("duplicateRow", () => {
  it("copies prompt and scripts as fresh drafts with new ids and no face", () => {
    const row = {
      ...newRow("woman, studio"),
      faceStatus: "ready" as const,
      faceUrl: "https://x/face.png",
      tiles: [{ ...newTile("line one"), status: "done" as const, videoUrl: "https://x/v.mp4" }],
    };
    const copy = duplicateRow(row);
    expect(copy.id).not.toBe(row.id);
    expect(copy.facePrompt).toBe("woman, studio");
    expect(copy.faceStatus).toBe("empty");
    expect(copy.faceUrl).toBeNull();
    expect(copy.tiles).toHaveLength(1);
    expect(copy.tiles[0].id).not.toBe(row.tiles[0].id);
    expect(copy.tiles[0].script).toBe("line one");
    expect(copy.tiles[0].status).toBe("draft");
    expect(copy.tiles[0].videoUrl).toBeNull();
  });
});

describe("runnableTiles", () => {
  it("returns draft tiles with a script, only in rows that have a face", () => {
    const ready = {
      ...newRow("a"),
      faceStatus: "ready" as const,
      faceUrl: "https://x/f.png",
      tiles: [newTile("go"), newTile("   "), { ...newTile("done"), status: "done" as const }],
    };
    const noFace = { ...newRow("b"), tiles: [newTile("waits")] };
    const out = runnableTiles([ready, noFace]);
    expect(out).toEqual([{ rowId: ready.id, tileId: ready.tiles[0].id }]);
  });
});
