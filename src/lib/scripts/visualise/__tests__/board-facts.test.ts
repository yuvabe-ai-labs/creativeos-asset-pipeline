import { describe, it, expect } from "vitest";
import { boardFacts, resolvePicks } from "../board-facts";
import { HUSBAND_AVATAR, MEENAKSHI_AVATAR, linkedDoc, makeScript, makeTake, readyAvatar, reel01Doc } from "./fixtures";
import type { VisualiseBoard } from "../schema";

const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const avatars = [readyAvatar(MEENAKSHI_AVATAR, "meenakshi"), readyAvatar(HUSBAND_AVATAR, "husband")];
const board = (over: Partial<VisualiseBoard> = {}): VisualiseBoard => ({ avatars, takes: [], picks: {}, kits: [], ...over });

describe("boardFacts", () => {
  it("numbers a shot's succeeded takes from 1 and names the picked one", () => {
    const takes = [
      makeTake({ id: "t2", shotId: "s01", createdAt: "2026-10-08T11:00:00.000Z" }),
      makeTake({ id: "t1", shotId: "s01", createdAt: "2026-10-08T10:00:00.000Z" }),
      makeTake({ id: "tf", shotId: "s01", status: "failed", url: null, createdAt: "2026-10-08T10:30:00.000Z" }),
    ];
    const f = boardFacts(makeScript(), board({ takes, picks: { s01: "t2" } }), NOW);
    expect(f.shots[0]).toMatchObject({ id: "s01", label: "S1", versions: 2, picked: 2 });
    expect(f.shots[1]).toMatchObject({ id: "s02", label: "S2", panel: "not_yet", versions: 0, picked: null });
  });

  it("leaves out a character on screen in no shot, and names one with no avatar", () => {
    const doc = reel01Doc();
    doc.cast.push({ id: "narrator", name: "Narrator", description: "Voice.", avatarId: null, isLead: false });
    const f = boardFacts(makeScript(doc), board({ avatars: [] }), NOW);
    expect(f.castWithoutAvatar).toEqual(["Meenakshi", "Meenakshi's husband"]);
    expect(f.shots[0].panel).toBe("waiting");
  });

  it("lists a used location or product with no picture, and not an unused one", () => {
    const doc = linkedDoc();
    doc.locations = [
      { id: "cafe", name: "the café", description: "A small café.", image: null },
      { id: "park", name: "the park", description: "Unused.", image: null },
    ];
    doc.products = [{ id: "pouch", name: "the pouch", images: [] }];
    doc.shots[0] = { ...doc.shots[0], location: "cafe", products: ["pouch"] };
    expect(boardFacts(makeScript(doc), board(), NOW).withoutPicture).toEqual(["the café (location)", "the pouch (product)"]);
  });
});

describe("resolvePicks", () => {
  const takes = [
    makeTake({ id: "a1", shotId: "s01", createdAt: "2026-10-08T10:00:00.000Z" }),
    makeTake({ id: "a2", shotId: "s01", createdAt: "2026-10-08T11:00:00.000Z" }),
    makeTake({ id: "b1", shotId: "s02", status: "failed", url: null }),
  ];
  it("turns a version number into that shot's take, and skips any that do not exist", () => {
    expect(resolvePicks([{ shotId: "s01", version: 2 }, { shotId: "s02", version: 1 }, { shotId: "s01", version: 9 }], takes))
      .toEqual([{ shotId: "s01", takeId: "a2" }]);
  });
});
