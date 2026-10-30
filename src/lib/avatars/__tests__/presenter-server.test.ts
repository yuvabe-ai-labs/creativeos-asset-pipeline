import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeAvatar } from "./fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/nodes", () => ({ getUpstreamOutputs: vi.fn() }));
vi.mock("@/lib/db/presenter", () => ({ getNodeClientAndData: vi.fn(), getScriptPresenterSource: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn() }));
vi.mock("../voice-reference", () => ({ prepareNamedVoiceReference: vi.fn() }));

import { getUpstreamOutputs } from "@/lib/db/nodes";
import { getNodeClientAndData, getScriptPresenterSource } from "@/lib/db/presenter";
import { getAvatar } from "@/lib/db/avatars";
import { prepareNamedVoiceReference } from "../voice-reference";
import { getPromptUpstream, loadPresenterForPromptNode, presenterVoiceForSeedance, withAvatarImages, withPromptInputs } from "../presenter-server";
import { GENERATED, makeImage } from "./fixtures";

const riyaLine = { text: "Hi", speaker: "Riya", delivery: "", language: "en" };
const narratorLine = { text: "Hi", speaker: "narrator", delivery: "", language: "en" };
const shotRow = (lines: object[]) => ({
  nodeId: "shot-1", type: "shot", activeOutput: null, versionId: null,
  data: { seededFrom: { scriptNodeId: "script-1" }, script: { visual_script: { shots: [{ voiceover: lines }] } } },
});
const avatar = makeAvatar({ name: "Riya" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getNodeClientAndData).mockResolvedValue({ clientId: "c1", data: {} });
  vi.mocked(getScriptPresenterSource).mockResolvedValue({ avatarNodeId: "avatar-node-1", avatarId: "a1" });
  vi.mocked(getAvatar).mockResolvedValue(avatar);
});

describe("getPromptUpstream with script products and locations (D450)", () => {
  it("reads the Product and Location nodes wired into the prompt node's shot, after its own inputs", async () => {
    vi.mocked(getScriptPresenterSource).mockResolvedValue(null);
    vi.mocked(getUpstreamOutputs).mockImplementation(async (id: string) => (id === "prompt-1"
      ? [shotRow([narratorLine])]
      : [
          { nodeId: "loc", type: "location", activeOutput: null, versionId: null, data: { name: "Home kitchen", locationId: "kitchen", image: { url: "https://x/k.png" } } },
          { nodeId: "panel", type: "file", activeOutput: null, versionId: null, data: { fileKind: "image", fileUrl: "https://x/panel.png" } },
        ]) as never);
    const ups = await getPromptUpstream("prompt-1");
    expect(ups.map((u) => u.nodeId)).toEqual(["shot-1", "loc"]);
    expect(ups[1].data).toMatchObject({ fileUrl: "https://x/k.png", scriptAsset: { kind: "location", name: "Home kitchen" } });
  });
});

describe("getPromptUpstream", () => {
  it("adds the presenter as a virtual image input when the shot has an on-camera line", async () => {
    vi.mocked(getUpstreamOutputs).mockResolvedValue([shotRow([riyaLine])] as never);
    const ups = await getPromptUpstream("prompt-1");
    expect(ups).toHaveLength(3) // the shot, the front and the sheet (D308);
    expect(ups[1]).toMatchObject({
      nodeId: "avatar-node-1",
      type: "file",
      data: { presenter: true, title: "Riya", fileKind: "image", fileUrl: avatar.front!.url },
    });
    expect(getAvatar).toHaveBeenCalledWith("c1", "a1");
  });

  it("names the script's on-camera speaker after the avatar, so the words and the face agree", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ name: "Razel" }));
    vi.mocked(getUpstreamOutputs).mockResolvedValue([shotRow([{ ...riyaLine, speaker: "creator" }])] as never);
    const [shot] = await getPromptUpstream("prompt-1");
    const script = shot.data.script as { visual_script: { shots: { voiceover: { speaker: string }[] }[] } };
    expect(script.visual_script.shots[0].voiceover[0].speaker).toBe("Razel");
  });

  it("adds the profile sheet after the front (D308)", async () => {
    vi.mocked(getUpstreamOutputs).mockResolvedValue([shotRow([riyaLine])] as never);
    const ups = await getPromptUpstream("prompt-1");
    expect(ups.map((u) => u.nodeId)).toEqual(["shot-1", "avatar-node-1", "avatar-node-1:sheet"]);
  });

  it("puts the avatar in a narration-only shot too, by default (D438)", async () => {
    vi.mocked(getUpstreamOutputs).mockResolvedValue([shotRow([narratorLine])] as never);
    expect(await getPromptUpstream("prompt-1")).toHaveLength(3);
  });

  it("follows the operator's switch over the default", async () => {
    vi.mocked(getUpstreamOutputs).mockResolvedValue([shotRow([narratorLine])] as never);
    vi.mocked(getNodeClientAndData).mockResolvedValue({ clientId: "c1", data: { presenter: { inShot: true } } });
    expect(await getPromptUpstream("prompt-1")).toHaveLength(3);
    vi.mocked(getUpstreamOutputs).mockResolvedValue([shotRow([riyaLine])] as never);
    vi.mocked(getNodeClientAndData).mockResolvedValue({ clientId: "c1", data: { presenter: { inShot: false } } });
    expect(await getPromptUpstream("prompt-1")).toHaveLength(1);
  });

  it("does nothing — and asks the database nothing — without a seeded Shot or Multishot", async () => {
    vi.mocked(getUpstreamOutputs).mockResolvedValue([{ nodeId: "f", type: "file", data: {}, activeOutput: null, versionId: null }] as never);
    expect(await getPromptUpstream("prompt-1")).toHaveLength(1);
    expect(getScriptPresenterSource).not.toHaveBeenCalled();
  });

  it("does nothing when the script has no presenter, or the avatar is gone", async () => {
    vi.mocked(getUpstreamOutputs).mockResolvedValue([shotRow([riyaLine])] as never);
    vi.mocked(getScriptPresenterSource).mockResolvedValueOnce(null);
    expect(await getPromptUpstream("prompt-1")).toHaveLength(1);
    vi.mocked(getAvatar).mockResolvedValueOnce(null);
    expect(await getPromptUpstream("prompt-1")).toHaveLength(1);
  });
});

describe("loadPresenterForPromptNode", () => {
  it("still uses an archived avatar — what already uses one keeps working", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ archivedAt: "2026-10-01T00:00:00.000Z" }));
    const presenter = await loadPresenterForPromptNode("prompt-1", [shotRow([riyaLine])] as never);
    expect(presenter?.inShot).toBe(true);
  });
});

// D440 — what is wired into the prompt node reaches the gen node too (the presenter included).
describe("withPromptInputs", () => {
  const prompt = { nodeId: "prompt-1", type: "prompt", data: {}, activeOutput: null, versionId: null };
  const img = (id: string) => ({ nodeId: id, type: "image-gen", data: {}, activeOutput: `https://x/${id}.png`, versionId: null });

  it("adds the prompt node's inputs after the node's own, the presenter's face included", async () => {
    vi.mocked(getUpstreamOutputs).mockResolvedValue([shotRow([riyaLine]), img("kitchen")] as never);
    const ups = await withPromptInputs([prompt, img("own")] as never, ["prompt"]);
    expect(ups.map((u) => u.nodeId)).toEqual(["prompt-1", "own", "shot-1", "kitchen", "avatar-node-1", "avatar-node-1:sheet"]);
    expect(getUpstreamOutputs).toHaveBeenCalledWith("prompt-1");
  });

  it("keeps a direct edge's row when the same node also feeds the prompt", async () => {
    vi.mocked(getUpstreamOutputs).mockResolvedValue([img("own")] as never);
    const ups = await withPromptInputs([prompt, img("own")] as never, ["prompt"]);
    expect(ups.map((u) => u.nodeId)).toEqual(["prompt-1", "own"]);
  });

  it("reads nothing with no prompt node of those types", async () => {
    const ups = await withPromptInputs([img("own")] as never, ["prompt"]);
    expect(ups).toHaveLength(1);
    expect(getUpstreamOutputs).not.toHaveBeenCalled();
  });
});

describe("presenterVoiceForSeedance", () => {
  const named = { mode: "named" as const, voiceId: "v1", name: "Surabhi", labels: { gender: "female" }, previewUrl: null };
  const seedream = (over: object) => makeAvatar({ personType: "generic", front: makeImage(GENERATED), ...over });

  it("sends a named voice's reference, making it on demand when it is not there yet", async () => {
    vi.mocked(getAvatar).mockResolvedValue(seedream({ voice: named, voiceSample: null }));
    vi.mocked(prepareNamedVoiceReference).mockResolvedValue({ url: "https://x/v1.mp3", durationSeconds: 8, sourceKey: "elevenlabs:v1" });
    const voice = await presenterVoiceForSeedance("prompt-1", [shotRow([riyaLine])] as never);
    expect(voice).toMatchObject({ referenceAudioUrl: "https://x/v1.mp3" });
    expect(voice?.text).toContain("@Audio 1");
  });

  it("uses the engine's own voice's sample as it is", async () => {
    vi.mocked(getAvatar).mockResolvedValue(seedream({ voice: { mode: "native" }, voiceSample: { url: "https://x/n.mp3", durationSeconds: 5, sourceKey: "gen-1" } }));
    const voice = await presenterVoiceForSeedance("prompt-1", [shotRow([riyaLine])] as never);
    expect(voice?.referenceAudioUrl).toBe("https://x/n.mp3");
    expect(prepareNamedVoiceReference).not.toHaveBeenCalled();
  });

  it("goes ahead without audio when the avatar has no voice", async () => {
    vi.mocked(getAvatar).mockResolvedValue(seedream({ voice: null }));
    expect(await presenterVoiceForSeedance("prompt-1", [shotRow([riyaLine])] as never)).toMatchObject({ referenceAudioUrl: null, text: null });
  });

  it("is nothing when the presenter is switched out of the shot", async () => {
    vi.mocked(getNodeClientAndData).mockResolvedValue({ clientId: "c1", data: { presenter: { inShot: false } } });
    expect(await presenterVoiceForSeedance("prompt-1", [shotRow([narratorLine])] as never)).toBeNull();
  });
});

// D436 — an avatar wired straight in is its images: front, then sheet, in its place.
describe("withAvatarImages", () => {
  const wired = (nodeId: string, avatarId: string) => ({ nodeId, type: "avatar", data: { avatarId }, activeOutput: null, versionId: null });
  const file = { nodeId: "file-1", type: "file", data: { fileKind: "image", fileUrl: "https://x/f.png" }, activeOutput: null, versionId: null };

  it("expands each wired avatar in place, as one more person on camera", async () => {
    const ups = await withAvatarImages("gen-1", [wired("av-1", "a1"), file] as never);
    expect(ups.map((u) => u.nodeId)).toEqual(["av-1", "av-1:sheet", "file-1"]);
    expect(ups[0]).toMatchObject({ type: "file", data: { presenter: true, fileUrl: avatar.front!.url } });
    expect(String(ups[0].data.processedOutput)).toContain("Riya, a person on camera");
    expect(getAvatar).toHaveBeenCalledWith("c1", "a1");
  });

  it("drops an avatar that is gone or has no front yet", async () => {
    vi.mocked(getAvatar).mockResolvedValueOnce(null).mockResolvedValueOnce(makeAvatar({ front: null }));
    const ups = await withAvatarImages("gen-1", [wired("av-1", "a1"), wired("av-2", "a2"), file] as never);
    expect(ups.map((u) => u.nodeId)).toEqual(["file-1"]);
  });

  it("reads nothing when no avatar is wired", async () => {
    const ups = await withAvatarImages("gen-1", [file] as never);
    expect(ups).toEqual([file]);
    expect(getNodeClientAndData).not.toHaveBeenCalled();
  });

  it("never adds the script's presenter twice when it is also wired straight in", async () => {
    vi.mocked(getUpstreamOutputs).mockResolvedValue([shotRow([riyaLine]), wired("avatar-node-1", "a1")] as never);
    const ups = await getPromptUpstream("prompt-1");
    expect(ups.map((u) => u.nodeId)).toEqual(["shot-1", "avatar-node-1", "avatar-node-1:sheet"]);
  });
});
