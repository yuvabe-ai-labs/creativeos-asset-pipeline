import { describe, it, expect, vi } from "vitest";
import { GENERATED, makeAvatar, makeImage, makeViews } from "@/lib/avatars/__tests__/fixtures";
import type { Avatar } from "@/lib/avatars/schema";
import {
  avatarDescriptionFor, castSlotLine, finishAvatar, makeGeneratedAvatar, nextMakerStep, reusableFor, type MakerDeps,
} from "../maker";
import { reel01Doc } from "./fixtures";

const meenakshi = reel01Doc().cast[0];
const draft = (over: Partial<Avatar> = {}) =>
  makeAvatar({ id: "new", status: "draft", front: null, sheet: null, sheetViews: null, likenessConsentAt: null, ...over });

function deps(calls: string[]): MakerDeps {
  const generatedFront = { ...makeImage(GENERATED), url: "https://x/face.png" };
  return {
    createAndLink: vi.fn(async (fields: { name: string; story: string }) => { calls.push(`create:${fields.name}`); return draft(); }),
    generateFront: vi.fn(async (_id: string, description: string) => { calls.push(`face:${description}`); return { generationId: "g1" }; }),
    pickFront: vi.fn(async () => { calls.push("pick"); return draft({ front: generatedFront, sheetStale: true }); }),
    generateViews: vi.fn(async () => { calls.push("views"); return draft({ front: generatedFront, sheetViews: makeViews() }); }),
    markReady: vi.fn(async () => { calls.push("save"); return draft({ front: generatedFront, sheetViews: makeViews(), status: "ready" }); }),
    onStep: vi.fn(),
  };
}

describe("makeGeneratedAvatar (D338)", () => {
  it("makes and links a new avatar, then the face, the four views, and saves it to Avatars", async () => {
    const calls: string[] = [];
    const avatar = await makeGeneratedAvatar(deps(calls), { member: meenakshi, avatar: null, instructions: "", fresh: false });
    expect(calls).toEqual(["create:Meenakshi", `face:${meenakshi.description}`, "pick", "views", "save"]);
    expect(avatar.status).toBe("ready");
  });

  it("resumes a linked draft from the first step not done, so a failed view is retried without a new face", async () => {
    const calls: string[] = [];
    await makeGeneratedAvatar(deps(calls), {
      member: meenakshi, avatar: draft({ front: makeImage(GENERATED) }), instructions: "", fresh: false,
    });
    expect(calls).toEqual(["views", "save"]);
  });

  it("Regenerate avatar always makes a new face, from the description and the instructions", async () => {
    const calls: string[] = [];
    const ready = makeAvatar({ front: makeImage(GENERATED), sheetViews: makeViews(), status: "ready" });
    await makeGeneratedAvatar(deps(calls), { member: meenakshi, avatar: ready, instructions: "Greyer at the temples", fresh: true });
    expect(calls[0]).toBe(`face:${meenakshi.description} Greyer at the temples`);
  });

  it("makes a new avatar rather than turning a real person's photo into a generated face", async () => {
    const calls: string[] = [];
    await makeGeneratedAvatar(deps(calls), { member: meenakshi, avatar: makeAvatar(), instructions: "", fresh: true });
    expect(calls[0]).toBe("create:Meenakshi");
  });
});

describe("finishAvatar", () => {
  it("waits for permission on a real person's photo before making views", async () => {
    const calls: string[] = [];
    await expect(finishAvatar(deps(calls), draft({ front: makeImage() }))).rejects.toThrow(/permission/);
    expect(calls).toEqual([]);
  });

  it("is a no-op for an avatar that is already saved with its four views", async () => {
    const calls: string[] = [];
    const done = makeAvatar({ sheetViews: makeViews() });
    expect(await finishAvatar(deps(calls), done)).toBe(done);
    expect(calls).toEqual([]);
  });
});

describe("the slot's rules", () => {
  it("nextMakerStep follows the avatar", () => {
    expect(nextMakerStep(null)).toBe("face");
    expect(nextMakerStep(draft({ front: makeImage() }))).toBeNull(); // a real person waits for permission
    expect(nextMakerStep(draft({ front: makeImage(GENERATED) }))).toBe("views");
    expect(nextMakerStep(draft({ front: makeImage(GENERATED), sheetViews: makeViews() }))).toBe("save");
    expect(nextMakerStep(makeAvatar({ sheetViews: makeViews() }))).toBeNull();
  });

  it("reusableFor keeps a face's kind: a photo is never regenerated, a generated face never replaced by a photo", () => {
    expect(reusableFor("ai", makeAvatar({ front: makeImage(GENERATED) }))?.id).toBe("a1");
    expect(reusableFor("ai", makeAvatar())).toBeNull();
    expect(reusableFor("photo", makeAvatar())?.id).toBe("a1");
    expect(reusableFor("photo", makeAvatar({ front: makeImage(GENERATED) }))).toBeNull();
    expect(reusableFor("photo", draft())?.id).toBe("new");
    expect(reusableFor("ai", makeAvatar({ archivedAt: "2026-10-08T00:00:00.000Z" }))).toBeNull();
  });

  it("avatarDescriptionFor adds the instructions and stays within what the front route takes", () => {
    expect(avatarDescriptionFor({ ...meenakshi, description: "x".repeat(1490) }, "Greyer at the temples")).toHaveLength(1500);
  });

  it("castSlotLine says where the avatar stands", () => {
    expect(castSlotLine(null)).toBe("No avatar yet");
    expect(castSlotLine(makeAvatar({ sheetViews: makeViews(), createdAt: "2026-10-09T10:00:00.000Z" }))).toMatch(/^Made .+ · saved to Avatars$/);
    expect(castSlotLine(makeAvatar({ sheetViews: null }))).toMatch(/needs its four views$/);
    expect(castSlotLine(draft())).toBe("Draft · saved to Avatars once its four views are made");
    expect(castSlotLine(makeAvatar({ archivedAt: "2026-10-08T00:00:00.000Z" }))).toBe("This avatar was archived. Change it to go on.");
  });
});

describe("finishAvatar asks only for the missing views (review finding 1)", () => {
  it("retries just the view that failed, so it costs what the button shows and keeps the good views", async () => {
    const d = deps([]);
    await finishAvatar(d, draft({ front: makeImage(GENERATED), sheetViews: { ...makeViews(), back: null } }));
    expect(d.generateViews).toHaveBeenCalledWith("new", ["back"]);
  });

  it("asks for all four for a face with no views yet", async () => {
    const d = deps([]);
    await finishAvatar(d, draft({ front: makeImage(GENERATED) }));
    expect(d.generateViews).toHaveBeenCalledWith("new", ["front", "left", "right", "back"]);
  });
});
