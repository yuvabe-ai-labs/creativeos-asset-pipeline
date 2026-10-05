import { describe, it, expect } from "vitest";
import {
  avatarFaceLabel, avatarLifecycle, isLookDone, isStepDone, isStepLoading, isStepOpen, stepStatusLine,
  studioOpeningStep, STUDIO_STEPS, voiceChoiceOf, type StudioSnapshot,
} from "../studio";
import { GENERATED, makeAvatar, makeImage } from "./fixtures";
import type { Avatar, AvatarVoice, AvatarVoiceSample } from "../schema";

const NAMED: AvatarVoice = { mode: "named", voiceId: "v1", name: "Surabhi", labels: {}, previewUrl: null };
const SAMPLE: AvatarVoiceSample = { url: "https://storage.googleapis.com/b/s.mp3", durationSeconds: 4.8, sourceKey: "g1" };
/** A generated avatar: the only kind that can declare the engine's own voice. */
const generated = (overrides: Partial<Avatar> = {}) =>
  makeAvatar({ personType: "generic", front: makeImage(GENERATED), likenessConsentBy: null, likenessConsentAt: null, ...overrides });

function snap(overrides: Partial<StudioSnapshot> = {}): StudioSnapshot {
  return {
    avatar: makeAvatar({ status: "draft" }),
    name: "Riya",
    preview: null,
    sheetGenerating: false,
    skipped: new Set(),
    ...overrides,
  };
}

describe("STUDIO_STEPS", () => {
  it("runs Name, Look, Profile sheet, Voice, Preview, with only the first two required", () => {
    expect(STUDIO_STEPS.map((s) => s.id)).toEqual(["name", "look", "sheet", "voice", "preview"]);
    expect(STUDIO_STEPS.filter((s) => !s.optional).map((s) => s.id)).toEqual(["name", "look"]);
  });
});

describe("isLookDone", () => {
  it("needs a front image", () => {
    expect(isLookDone(makeAvatar({ front: null }))).toBe(false);
    expect(isLookDone(null)).toBe(false);
  });
  it("a generated front is enough on its own", () => {
    expect(isLookDone(generated())).toBe(true);
  });
  it("an uploaded photo also needs the permission", () => {
    expect(isLookDone(makeAvatar({ likenessConsentBy: null, likenessConsentAt: null }))).toBe(false);
    expect(isLookDone(makeAvatar())).toBe(true);
  });
});

describe("isStepOpen", () => {
  it("Name is always open, even before the avatar exists", () => {
    expect(isStepOpen("name", snap({ avatar: null, name: "" }))).toBe(true);
  });
  it("Look waits for a name — the preview says it", () => {
    expect(isStepOpen("look", snap({ avatar: null, name: "  " }))).toBe(false);
    expect(isStepOpen("look", snap({ avatar: null, name: "Riya" }))).toBe(true);
  });
  it("the rest wait for Look", () => {
    const noFront = snap({ avatar: makeAvatar({ front: null, status: "draft" }) });
    for (const id of ["sheet", "voice", "preview"] as const) expect(isStepOpen(id, noFront)).toBe(false);
  });
  it("they open together once Look is done and there is a name", () => {
    for (const id of ["sheet", "voice", "preview"] as const) expect(isStepOpen(id, snap())).toBe(true);
    for (const id of ["sheet", "voice", "preview"] as const) expect(isStepOpen(id, snap({ name: "" }))).toBe(false);
  });
});

describe("isStepDone", () => {
  it("a stale sheet does not count", () => {
    expect(isStepDone("sheet", snap({ avatar: makeAvatar({ sheetStale: true }) }))).toBe(false);
    expect(isStepDone("sheet", snap())).toBe(true);
  });
  it("a preview counts only while it still shows this face and voice", () => {
    const avatar = generated({ voice: { mode: "native" } });
    const preview = { status: "succeeded", mode: "native", voiceId: null, frontUrl: avatar.front!.url } as const;
    expect(isStepDone("preview", snap({ avatar, preview }))).toBe(true);
    expect(isStepDone("preview", snap({ avatar: { ...avatar, voice: NAMED }, preview }))).toBe(false);
    expect(isStepDone("preview", snap({ avatar, preview: { ...preview, status: "running" } }))).toBe(false);
  });
  it("Name is done once a name is typed", () => {
    expect(isStepDone("name", snap())).toBe(true);
    expect(isStepDone("name", snap({ name: "  " }))).toBe(false);
  });
});

describe("studioOpeningStep", () => {
  it("a new avatar, or a draft with no name, opens on Name", () => {
    expect(studioOpeningStep(null)).toBe("name");
    expect(studioOpeningStep(makeAvatar({ status: "draft", name: " " }))).toBe("name");
  });
  it("a named draft without a finished Look opens on Look", () => {
    expect(studioOpeningStep(makeAvatar({ status: "draft", front: null }))).toBe("look");
    expect(studioOpeningStep(makeAvatar({ status: "draft", likenessConsentAt: null }))).toBe("look");
  });
  it("an avatar in the library opens on its last step, where Done is", () => {
    expect(studioOpeningStep(makeAvatar({ status: "ready" }))).toBe("preview");
  });
  it("a draft opens on its first unfinished optional step", () => {
    expect(studioOpeningStep(makeAvatar({ status: "draft", sheet: null }))).toBe("sheet");
    expect(studioOpeningStep(makeAvatar({ status: "draft", sheetStale: true }))).toBe("sheet");
    expect(studioOpeningStep(makeAvatar({ status: "draft", voice: null }))).toBe("voice");
    expect(studioOpeningStep(makeAvatar({ status: "draft", voice: NAMED }))).toBe("preview");
  });
});

describe("stepStatusLine", () => {
  it("Look asks for a front, names the image model, or asks for permission", () => {
    expect(stepStatusLine("look", snap({ avatar: null }))).toBe("Needed");
    expect(stepStatusLine("look", snap({ avatar: generated() }))).toBe("Generic");
    expect(stepStatusLine("look", snap({ avatar: makeAvatar() }))).toBe("Specific");
    expect(stepStatusLine("look", snap({ avatar: makeAvatar({ likenessConsentAt: null }) }))).toBe("Needs permission");
  });
  it("the sheet line follows its state", () => {
    expect(stepStatusLine("sheet", snap({ avatar: makeAvatar({ sheet: null }) }))).toBe("Optional");
    expect(stepStatusLine("sheet", snap({ sheetGenerating: true }))).toBe("Generating…");
    expect(stepStatusLine("sheet", snap({ avatar: makeAvatar({ sheetStale: true }) }))).toBe("Out of date");
    expect(stepStatusLine("sheet", snap())).toBe("Added");
  });
  it("an optional step left with Continue reads Skipped", () => {
    const skipped = new Set(["sheet", "voice", "preview"] as const);
    const avatar = makeAvatar({ sheet: null, voice: null });
    expect(stepStatusLine("sheet", snap({ avatar, skipped }))).toBe("Skipped");
    expect(stepStatusLine("voice", snap({ avatar, skipped }))).toBe("Skipped");
    expect(stepStatusLine("preview", snap({ avatar, skipped }))).toBe("Skipped");
  });
  it("the voice line names the voice", () => {
    expect(stepStatusLine("voice", snap({ avatar: makeAvatar({ voice: NAMED }) }))).toBe("Surabhi");
    expect(stepStatusLine("voice", snap({ avatar: generated({ voice: { mode: "native" } }) }))).toBe("Chosen for me");
  });
  it("the preview says when it saved a voice reference, and when it is out of date", () => {
    const avatar = generated({ voice: { mode: "native" }, voiceSample: SAMPLE });
    const preview = { status: "succeeded", mode: "native", voiceId: null, frontUrl: avatar.front!.url } as const;
    expect(stepStatusLine("preview", snap({ avatar, preview }))).toBe("Voice kept");
    expect(stepStatusLine("preview", snap({ avatar: { ...avatar, voiceSample: null }, preview }))).toBe("Clip ready");
    expect(stepStatusLine("preview", snap({ avatar: { ...avatar, voice: NAMED }, preview }))).toBe("Out of date");
    expect(stepStatusLine("preview", snap({ avatar, preview: { ...preview, status: "running" } }))).toBe("Generating…");
  });
  it("Name follows the name being typed, not the stored one", () => {
    expect(stepStatusLine("name", snap({ name: "  " }))).toBe("Needed");
    expect(stepStatusLine("name", snap({ name: "Riya" }))).toBe("Riya");
  });
});

describe("avatarLifecycle", () => {
  it("is new before any row exists, a draft until saved, then in the library", () => {
    expect(avatarLifecycle(null)).toBe("new");
    expect(avatarLifecycle(makeAvatar({ status: "draft" }))).toBe("draft");
    expect(avatarLifecycle(makeAvatar({ status: "ready" }))).toBe("library");
  });
});

describe("avatarFaceLabel", () => {
  it("says how the face was made", () => {
    expect(avatarFaceLabel(makeAvatar())).toBe("Specific");
    expect(avatarFaceLabel(generated())).toBe("Generic");
    expect(avatarFaceLabel(makeAvatar({ front: null }))).toBeNull();
  });
});

describe("isStepLoading", () => {
  it("holds the Preview step while its preview is being read, and only that step", () => {
    expect(isStepLoading("preview", snap({ previewLoading: true }))).toBe(true);
    expect(isStepLoading("voice", snap({ previewLoading: true }))).toBe(false);
    expect(isStepLoading("preview", snap({}))).toBe(false);
  });
});

describe("voiceChoiceOf", () => {
  it("opens the Voice step on the card the declaration came from", () => {
    expect(voiceChoiceOf({ mode: "native" })).toBe("auto");
    expect(voiceChoiceOf({ ...NAMED, origin: "custom" } as AvatarVoice)).toBe("custom");
    expect(voiceChoiceOf({ ...NAMED, origin: "library" } as AvatarVoice)).toBe("library");
    expect(voiceChoiceOf(NAMED)).toBe("library");
    expect(voiceChoiceOf(null)).toBeNull();
  });
});
