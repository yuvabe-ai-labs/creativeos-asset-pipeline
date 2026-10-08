// src/lib/script-review/__tests__/visuals.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeAvatar, makeImage } from "@/lib/avatars/__tests__/fixtures";
import type { Script } from "@/lib/scripts/schema";
import { AVATAR_ID, reelDoc } from "./fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/avatars", () => ({ listAvatars: vi.fn() }));
vi.mock("@/lib/script-review/bridge", async (orig) => ({
  ...(await orig<typeof import("../bridge")>()),
  getPickedPanels: vi.fn(),
}));

import { listAvatars } from "@/lib/db/avatars";
import { getPickedPanels } from "@/lib/script-review/bridge";
import { collectVisuals, toAvatarSnapshot } from "../visuals";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const OTHER = "9b9b9b9b-0000-4000-8000-000000000009";

function script(): Script {
  const doc = reelDoc();
  doc.cast = doc.cast.map((c) => ({ ...c, avatarId: c.id === "meenakshi" ? AVATAR_ID : OTHER }));
  return { id: SCRIPT_ID, clientId: "c1", stage: "in_review", doc, approvedAt: null, createdAt: "x", updatedAt: "x" };
}

beforeEach(() => vi.resetAllMocks());

describe("collectVisuals", () => {
  it("freezes nothing besides the text on a script-only share", async () => {
    expect(await collectVisuals("c1", script(), "script")).toEqual({ avatars: {}, panels: {} });
    expect(listAvatars).not.toHaveBeenCalled();
    expect(getPickedPanels).not.toHaveBeenCalled();
  });

  it("freezes a ready avatar of this client's, and leaves out one that is not (Review Focus 4)", async () => {
    // OTHER is not in this client's live list: another client's, or archived.
    vi.mocked(listAvatars).mockResolvedValue([makeAvatar({ id: AVATAR_ID, name: "Meenakshi" })]);
    const visuals = await collectVisuals("c1", script(), "avatars");
    expect(Object.keys(visuals.avatars)).toEqual(["meenakshi"]);
    expect(visuals.avatars.meenakshi).toMatchObject({ avatarId: AVATAR_ID, name: "Meenakshi" });
    expect(listAvatars).toHaveBeenCalledWith("c1");
    expect(getPickedPanels).not.toHaveBeenCalled();

    // A draft is left out too.
    vi.mocked(listAvatars).mockResolvedValue([makeAvatar({ id: AVATAR_ID, status: "draft" })]);
    expect((await collectVisuals("c1", script(), "avatars")).avatars).toEqual({});
  });

  it("freezes the picked panels of this script's shots only", async () => {
    vi.mocked(listAvatars).mockResolvedValue([]);
    vi.mocked(getPickedPanels).mockResolvedValue({ s01: { takeId: "t1", url: "u1" }, ghost: { takeId: "t9", url: "u9" } });
    const visuals = await collectVisuals("c1", script(), "panels");
    expect(visuals.panels).toEqual({ s01: { takeId: "t1", url: "u1" } });
    expect(getPickedPanels).toHaveBeenCalledWith(SCRIPT_ID);
  });
});

describe("toAvatarSnapshot", () => {
  it("keeps the views from the bridge and a named voice with its preview", () => {
    const snap = toAvatarSnapshot(
      makeAvatar({
        id: AVATAR_ID, name: "Meenakshi", front: makeImage(),
        voice: { mode: "named", voiceId: "v1", name: "Kavya", labels: {}, previewUrl: "https://cdn/kavya.mp3" },
      }),
    );
    expect(snap.views).toEqual({ front: makeImage().url, left: null, right: null, back: null });
    expect(snap.voice).toEqual({ name: "Kavya", sampleUrl: "https://cdn/kavya.mp3" });
  });

  it("keeps a native voice's sample with no name, and no voice when there is none", () => {
    const native = toAvatarSnapshot(
      makeAvatar({ voice: { mode: "native" }, voiceSample: { url: "https://cdn/sample.mp3", durationSeconds: 4, sourceKey: "k" } }),
    );
    expect(native.voice).toEqual({ name: null, sampleUrl: "https://cdn/sample.mp3" });
    expect(toAvatarSnapshot(makeAvatar({ voice: null, voiceSample: null })).voice).toBeNull();
  });
});
