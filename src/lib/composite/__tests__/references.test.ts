import { describe, it, expect } from "vitest";
import type { UpstreamOutput } from "@/lib/db/nodes";
import type { Avatar, AvatarImage } from "@/lib/avatars/schema";
import { presenterUpstreamRows } from "@/lib/avatars/presenter";
import { avatarSheetId } from "@/lib/video-gen/select-references";
import {
  compositeRefs,
  referenceImagesOf,
  resolveCompositeMentions,
  danglingMentions,
  danglingMentionMessage,
} from "../references";

const img = (url: string): AvatarImage => ({
  url,
  width: 1024,
  height: 1024,
  sizeBytes: 2048,
  source: { kind: "upload", filename: "f.png", uploadedBy: "u", uploadedAt: "t" },
});
const RIYA = { name: "Riya", front: img("https://cdn/front.png"), sheet: img("https://cdn/sheet.png"), sheetStale: false } as Avatar;

const row = (nodeId: string, type: string, data: Record<string, unknown>, activeOutput: unknown = null): UpstreamOutput =>
  ({ nodeId, type, data, activeOutput, versionId: null });

// What the loader hands the roster: the avatar row already expanded, D308's way.
const AVATAR_ROWS = presenterUpstreamRows("n-av", RIYA);
const SANDALS = row("n-file", "file", { fileKind: "image", fileUrl: "https://cdn/sandals.png", filename: "Sandals.png", fileSizeBytes: 10 });
const OFFICE = row("n-cmp", "composite", { title: "Office sheet" }, "https://cdn/office.png");

describe("compositeRefs (D310)", () => {
  it("numbers one image per entry, in upstream order; the avatar's front then its sheet", () => {
    const refs = compositeRefs([...AVATAR_ROWS, SANDALS, OFFICE]);
    expect(refs.map((r) => [r.nodeId, r.name, r.role, r.position])).toEqual([
      ["n-av", "Riya", "avatar", 1],
      [avatarSheetId("n-av"), "Riya sheet", "avatar-sheet", 2],
      ["n-file", "Sandals.png", "image", 3],
      ["n-cmp", "Office sheet", "image", 4],
    ]);
    expect(referenceImagesOf(refs).map((i) => i.url)).toEqual([
      "https://cdn/front.png",
      "https://cdn/sheet.png",
      "https://cdn/sandals.png",
      "https://cdn/office.png",
    ]);
  });

  it("skips a stale sheet and keeps later numbering right", () => {
    const rows = presenterUpstreamRows("n-av", { ...RIYA, sheetStale: true });
    const refs = compositeRefs([...rows, SANDALS]);
    expect(refs.map((r) => r.role)).toEqual(["avatar", "image"]);
    expect(refs[1].position).toBe(2);
  });

  it("ignores rows that carry no image: text, a document file, an ungenerated still", () => {
    expect(
      compositeRefs([
        row("t", "text", { text: "hi" }),
        row("d", "file", { fileKind: "document", fileUrl: "https://cdn/a.pdf" }),
        row("g", "image-gen", {}, null),
      ]),
    ).toEqual([]);
  });

  it("carries size metadata for validation", () => {
    const [sandals] = referenceImagesOf(compositeRefs([SANDALS]));
    expect(sandals).toMatchObject({ url: "https://cdn/sandals.png", filename: "Sandals.png", fileSizeBytes: 10 });
  });
});

describe("resolveCompositeMentions", () => {
  const refs = compositeRefs([...AVATAR_ROWS, SANDALS]);

  it("turns chips into names with their image positions", () => {
    expect(
      resolveCompositeMentions(
        `@[Avatar: Riya](n-av) holding @[File: Sandals.png](n-file), dressed as in @[Avatar: Riya sheet](${avatarSheetId("n-av")})`,
        refs,
      ),
    ).toBe("Riya (image 1) holding Sandals.png (image 3), dressed as in Riya sheet (image 2)");
  });

  it("leaves plain text alone", () => {
    expect(resolveCompositeMentions("a bright bedroom, four angles", refs)).toBe("a bright bedroom, four angles");
  });
});

describe("danglingMentions", () => {
  const refs = compositeRefs([SANDALS]);

  it("names each chip whose node is no longer wired, once", () => {
    expect(
      danglingMentions("@[Avatar: Riya](gone) and @[Avatar: Riya](gone) with @[File: Sandals.png](n-file)", refs),
    ).toEqual(["Riya"]);
  });

  it("says what to do about them", () => {
    expect(danglingMentionMessage(["Riya"])).toBe(
      "'Riya' is mentioned in the instruction but no longer connected — reconnect it or remove the mention.",
    );
    expect(danglingMentionMessage(["Riya", "Office"])).toBe(
      "'Riya' and 'Office' are mentioned in the instruction but no longer connected — reconnect them or remove the mentions.",
    );
  });
});
