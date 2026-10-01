import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn(), updateAvatar: vi.fn() }));
vi.mock("@/lib/elevenlabs/voice-catalog", () => ({ cloneVoice: vi.fn(), deleteVoice: vi.fn() }));
vi.mock("@/lib/elevenlabs/voices-cache", () => ({ invalidateAccountVoices: vi.fn() }));

import { autoVoiceName, keepAutoVoice, type AutoVoiceDeps } from "../auto-voice";
import { makeAvatar } from "./fixtures";
import type { Avatar } from "../schema";

const sample = { url: "https://storage.googleapis.com/b/s.mp3", durationSeconds: 5, sourceKey: "g2" };
const native = (autoVoiceId?: string): Avatar =>
  makeAvatar({ name: "Riya", voice: { mode: "native", ...(autoVoiceId ? { autoVoice: { voiceId: autoVoiceId, sourceKey: "g1" } } : {}) } });

function makeDeps(over: Partial<AutoVoiceDeps> = {}): AutoVoiceDeps {
  return {
    fetchBytes: vi.fn(async () => new ArrayBuffer(8)),
    cloneVoice: vi.fn(async () => "new1"),
    deleteVoice: vi.fn(async () => undefined),
    getAvatar: vi.fn(async () => native("old1")),
    updateAvatar: vi.fn(async () => null),
    invalidate: vi.fn(),
    ...over,
  };
}
const args = { clientId: "c1", clientName: "Acme", avatarId: "a1", sample };

describe("keepAutoVoice", () => {
  it("clones the kept sample, records it as the avatar's auto voice and removes the previous one", async () => {
    const deps = makeDeps();
    expect(await keepAutoVoice(args, deps)).toBe("new1");
    expect(deps.fetchBytes).toHaveBeenCalledWith(sample.url);
    expect(vi.mocked(deps.cloneVoice).mock.calls[0][0]).toMatchObject({
      name: "Acme · Riya (auto)",
      files: [expect.objectContaining({ type: "audio/mpeg" })],
    });
    expect(deps.updateAvatar).toHaveBeenCalledWith("c1", "a1", {
      voice: { mode: "native", autoVoice: { voiceId: "new1", sourceKey: "g2" } },
    });
    expect(deps.invalidate).toHaveBeenCalledWith("new1");
    expect(deps.deleteVoice).toHaveBeenCalledWith("old1");
  });

  it("does nothing when the voice is no longer one chosen for the avatar", async () => {
    const deps = makeDeps({ getAvatar: vi.fn(async () => makeAvatar({ voice: null })) });
    expect(await keepAutoVoice(args, deps)).toBeNull();
    expect(deps.cloneVoice).not.toHaveBeenCalled();
  });

  it("returns null and records nothing when the clone fails", async () => {
    const deps = makeDeps({ cloneVoice: vi.fn(async () => { throw new Error("slot limit"); }) });
    expect(await keepAutoVoice(args, deps)).toBeNull();
    expect(deps.updateAvatar).not.toHaveBeenCalled();
    expect(deps.deleteVoice).not.toHaveBeenCalled();
  });

  it("still records the new voice when removing the old one fails", async () => {
    const deps = makeDeps({ deleteVoice: vi.fn(async () => { throw new Error("down"); }) });
    expect(await keepAutoVoice(args, deps)).toBe("new1");
    expect(deps.updateAvatar).toHaveBeenCalled();
  });

  it("drops the new clone when the voice changed while it was being made", async () => {
    const getAvatar = vi.fn()
      .mockResolvedValueOnce(native("old1"))
      .mockResolvedValueOnce(makeAvatar({ voice: { mode: "named", voiceId: "v", name: "S", labels: {}, previewUrl: null } }));
    const deps = makeDeps({ getAvatar });
    expect(await keepAutoVoice(args, deps)).toBeNull();
    expect(deps.updateAvatar).not.toHaveBeenCalled();
    expect(deps.deleteVoice).toHaveBeenCalledWith("new1");
  });
});

describe("autoVoiceName", () => {
  it("names the voice after the client and the avatar, marked as automatic", () => {
    expect(autoVoiceName("Acme", "Riya")).toBe("Acme · Riya (auto)");
    expect(autoVoiceName("Acme", "  ")).toBe("Acme · Avatar (auto)");
  });
});
