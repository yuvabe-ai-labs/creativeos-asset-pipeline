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
import { getPromptUpstream, loadPresenterForPromptNode, presenterVoiceForSeedance, withStillPresenter } from "../presenter-server";
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

  it("leaves a narration-only shot alone", async () => {
    vi.mocked(getUpstreamOutputs).mockResolvedValue([shotRow([narratorLine])] as never);
    expect(await getPromptUpstream("prompt-1")).toHaveLength(1);
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

describe("withStillPresenter", () => {
  it("adds the face to a still's connected images when its Prompt has the presenter in the shot", async () => {
    vi.mocked(getUpstreamOutputs).mockResolvedValue([shotRow([riyaLine])] as never);
    const ups = await withStillPresenter([{ nodeId: "prompt-1", type: "prompt", data: {}, activeOutput: null, versionId: null }]);
    expect(ups.map((u) => u.nodeId)).toEqual(["prompt-1", "avatar-node-1", "avatar-node-1:sheet"]);
    expect(getUpstreamOutputs).toHaveBeenCalledWith("prompt-1");
  });

  it("leaves a still with no Prompt alone", async () => {
    const ups = await withStillPresenter([{ nodeId: "f", type: "file", data: {}, activeOutput: null, versionId: null }]);
    expect(ups).toHaveLength(1);
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

  it("is nothing when the presenter is not in the shot", async () => {
    expect(await presenterVoiceForSeedance("prompt-1", [shotRow([narratorLine])] as never)).toBeNull();
  });
});
