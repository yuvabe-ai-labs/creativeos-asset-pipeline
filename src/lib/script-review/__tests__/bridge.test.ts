// src/lib/script-review/__tests__/bridge.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeAvatar, makeImage } from "@/lib/avatars/__tests__/fixtures";
import type { PanelTake } from "@/lib/scripts/visualise/schema";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/script-panels", () => ({ listPanelPicks: vi.fn(), listPanelTakes: vi.fn() }));

import { listPanelPicks, listPanelTakes } from "@/lib/db/script-panels";
import { avatarViewUrls, getPickedPanels } from "../bridge";

const take = (id: string, over: Partial<PanelTake> = {}) =>
  ({ id, scriptId: "s1", shotId: "x", status: "succeeded", url: `https://cdn/${id}.png`, ...over }) as unknown as PanelTake;
const image = (url: string) => ({ ...makeImage(), url });

beforeEach(() => vi.resetAllMocks());

describe("getPickedPanels (MP1)", () => {
  it("freezes each shot's picked take, and nothing for a pick without a finished image (Review Focus 3)", async () => {
    vi.mocked(listPanelPicks).mockResolvedValue({ s01: "t1", s02: "t2", s03: "t3" });
    vi.mocked(listPanelTakes).mockResolvedValue([
      take("t1"),
      take("t2", { status: "failed", url: null }),
      take("t3", { status: "succeeded", url: null }),
      take("t9"),
    ]);
    expect(await getPickedPanels("s1")).toEqual({ s01: { takeId: "t1", url: "https://cdn/t1.png" } });
    expect(listPanelPicks).toHaveBeenCalledWith("s1");
  });
});

describe("avatarViewUrls (MP2)", () => {
  it("returns the four views", () => {
    const avatar = makeAvatar({
      sheetViews: { front: image("f"), left: image("l"), right: null, back: image("b") },
    });
    expect(avatarViewUrls(avatar)).toEqual({ front: "f", left: "l", right: null, back: "b" });
  });

  it("falls back to the front image for an avatar made before D339 (Review Focus 2)", () => {
    const avatar = makeAvatar({ sheetViews: null, front: image("front-only") });
    expect(avatarViewUrls(avatar)).toEqual({ front: "front-only", left: null, right: null, back: null });
  });
});
