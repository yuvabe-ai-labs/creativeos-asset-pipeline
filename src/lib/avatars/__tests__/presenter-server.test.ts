import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeAvatar } from "./fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/nodes", () => ({ getUpstreamOutputs: vi.fn() }));
vi.mock("@/lib/db/presenter", () => ({ getNodeClientAndData: vi.fn(), getScriptPresenterSource: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn() }));

import { getUpstreamOutputs } from "@/lib/db/nodes";
import { getNodeClientAndData, getScriptPresenterSource } from "@/lib/db/presenter";
import { getAvatar } from "@/lib/db/avatars";
import { getPromptUpstream, loadPresenterForPromptNode, withStillPresenter } from "../presenter-server";

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
    expect(ups).toHaveLength(2);
    expect(ups[1]).toMatchObject({
      nodeId: "avatar-node-1",
      type: "file",
      data: { presenter: true, title: "Riya", fileKind: "image", fileUrl: avatar.front!.url },
    });
    expect(getAvatar).toHaveBeenCalledWith("c1", "a1");
  });

  it("leaves a narration-only shot alone", async () => {
    vi.mocked(getUpstreamOutputs).mockResolvedValue([shotRow([narratorLine])] as never);
    expect(await getPromptUpstream("prompt-1")).toHaveLength(1);
  });

  it("follows the operator's switch over the default", async () => {
    vi.mocked(getUpstreamOutputs).mockResolvedValue([shotRow([narratorLine])] as never);
    vi.mocked(getNodeClientAndData).mockResolvedValue({ clientId: "c1", data: { presenter: { inShot: true } } });
    expect(await getPromptUpstream("prompt-1")).toHaveLength(2);
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
    expect(ups.map((u) => u.nodeId)).toEqual(["prompt-1", "avatar-node-1"]);
    expect(getUpstreamOutputs).toHaveBeenCalledWith("prompt-1");
  });

  it("leaves a still with no Prompt alone", async () => {
    const ups = await withStillPresenter([{ nodeId: "f", type: "file", data: {}, activeOutput: null, versionId: null }]);
    expect(ups).toHaveLength(1);
  });
});
