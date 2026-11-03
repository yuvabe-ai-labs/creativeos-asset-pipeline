import { describe, expect, it } from "vitest";
import { resolveConnectedInputs, type ServerInput } from "../connected-inputs";

type Row = { id: string; type: string; fileUrl?: string; fileKind?: string; avatarId?: string; fileSizeBytes?: number };

const prompt: Row = { id: "p1", type: "prompt" };
const file: Row = { id: "f1", type: "file", fileUrl: "https://canvas/f.png", fileKind: "image", fileSizeBytes: 10 };
const still: Row = { id: "ig0", type: "image-gen", fileUrl: "https://canvas/still.png", fileKind: "image" };
const avatar: Row = { id: "av1", type: "avatar", avatarId: "a1" };

const server = (nodeId: string, extra: Partial<ServerInput> = {}): ServerInput => ({
  nodeId, label: "x", text: "", ...extra,
});
const SERVER_ROWS: ServerInput[] = [
  server("p1", { label: "Prompt", text: "A mug on a desk" }),
  server("f1", { label: "File", fileUrl: "https://server/f.png", fileKind: "image" }),
  server("ig0", { label: "Image", fileUrl: "https://server/still.png", fileKind: "image" }),
  server("av1", { label: "Avatar", fileUrl: "https://server/front.png", fileKind: "image" }),
  server("av1:sheet", { label: "Avatar sheet", fileUrl: "https://server/sheet.png", fileKind: "image" }),
  // Server-only rows: the shot's presenter, a script's location.
  server("presenter-node", { label: "Avatar", fileUrl: "https://server/presenter.png", fileKind: "image" }),
  server("loc1", { label: "Location", fileUrl: "https://server/loc.png", fileKind: "image" }),
];

describe("resolveConnectedInputs", () => {
  it("takes every preview's content from the server, matched by node id, keeping the canvas order", () => {
    const { rail } = resolveConnectedInputs([prompt, file, still, avatar], { status: "success", rows: SERVER_ROWS });
    expect(rail.map((r) => [r.id, r.previewState, r.fileUrl ?? r.text])).toEqual([
      ["p1", "server", "A mug on a desk"],
      ["f1", "server", "https://server/f.png"],
      ["ig0", "server", "https://server/still.png"],
      ["av1", "server", "https://server/front.png"],
    ]);
  });

  it("keeps the canvas row's type and image metadata, and an avatar's label unset (the rail says 'Avatar')", () => {
    const { rail } = resolveConnectedInputs([file, avatar], { status: "success", rows: SERVER_ROWS });
    expect(rail[0]).toMatchObject({ type: "file", fileSizeBytes: 10 });
    expect(rail[1]).toMatchObject({ type: "avatar", avatarId: "a1", fileKind: "image" });
    expect(rail[1].label).toBeUndefined();
  });

  it("lists an avatar's front, then its sheet, among the images — and only the rail's own rows", () => {
    const { rail, images } = resolveConnectedInputs([prompt, avatar, file], { status: "success", rows: SERVER_ROWS });
    expect(rail.map((r) => r.id)).toEqual(["p1", "av1", "f1"]);
    expect(images.map((r) => r.id)).toEqual(["p1", "av1", "av1:sheet", "f1"]);
    expect(images[2]).toMatchObject({ type: "avatar", label: "Avatar sheet", fileUrl: "https://server/sheet.png" });
  });

  it("stands the canvas content in while the read is loading; an avatar waits", () => {
    const { rail, images } = resolveConnectedInputs([file, avatar], { status: "pending" });
    expect(rail.map((r) => [r.id, r.previewState, r.fileUrl])).toEqual([
      ["f1", "placeholder", "https://canvas/f.png"],
      ["av1", "loading", undefined],
    ]);
    expect(images.map((r) => r.id)).toEqual(["f1"]);
  });

  it("falls back to the canvas when the read fails; an avatar reports the failure", () => {
    const { rail, images } = resolveConnectedInputs([file, avatar], { status: "error" });
    expect(rail.map((r) => r.previewState)).toEqual(["placeholder", "error"]);
    expect(images.map((r) => r.id)).toEqual(["f1"]);
  });

  it("marks an avatar the server dropped (gone, or no front) as missing, and keeps it off the images", () => {
    const rows = SERVER_ROWS.filter((r) => !r.nodeId.startsWith("av1"));
    const { rail, images } = resolveConnectedInputs([avatar, file], { status: "success", rows });
    expect(rail[0]).toMatchObject({ id: "av1", previewState: "missing" });
    expect(images.map((r) => r.id)).toEqual(["f1"]);
  });

  it("keeps an input wired after the read on its canvas content until the next read", () => {
    const wiredLater: Row = { id: "d9", type: "draw", fileUrl: "https://canvas/sketch.png" };
    const { rail } = resolveConnectedInputs([wiredLater], { status: "success", rows: SERVER_ROWS });
    expect(rail[0]).toMatchObject({ previewState: "placeholder", fileUrl: "https://canvas/sketch.png" });
  });

  it("keeps the last answer on screen while a rewire reads again; a new avatar is loading, not missing", () => {
    const added: Row = { id: "av2", type: "avatar", avatarId: "a2" };
    const { rail, images } = resolveConnectedInputs([avatar, added], {
      status: "success",
      rows: SERVER_ROWS,
      refreshing: true,
    });
    expect(rail.map((r) => [r.id, r.previewState])).toEqual([
      ["av1", "server"],
      ["av2", "loading"],
    ]);
    expect(images.map((r) => r.id)).toEqual(["av1", "av1:sheet"]);
  });
});
