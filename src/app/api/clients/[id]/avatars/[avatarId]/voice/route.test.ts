import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GENERATED, makeAvatar, makeImage } from "@/lib/avatars/__tests__/fixtures";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn(), updateAvatar: vi.fn() }));
vi.mock("@/lib/db/client-voices", () => ({ listClientVoiceIds: vi.fn() }));
vi.mock("@/lib/elevenlabs/voices-cache", () => ({ getVoiceCached: vi.fn() }));
// `after` only runs inside a real request; here it records what was scheduled.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/avatars/voice-reference", () => ({ prepareNamedVoiceReference: vi.fn() }));
vi.mock("@/lib/elevenlabs/voice-catalog", () => ({ deleteVoice: vi.fn() }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { listClientVoiceIds } from "@/lib/db/client-voices";
import { getVoiceCached } from "@/lib/elevenlabs/voices-cache";
import { after } from "next/server";
import { prepareNamedVoiceReference } from "@/lib/avatars/voice-reference";
import { deleteVoice } from "@/lib/elevenlabs/voice-catalog";

const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const put = (body: unknown) =>
  new NextRequest("http://localhost/api/clients/c1/avatars/a1/voice", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const picked = (over: Partial<PickerVoice> = {}): PickerVoice => ({
  voiceId: "mine", source: "account", name: "Acme · James", description: null, previewUrl: "https://x/p.mp3",
  labels: { gender: "male" }, category: "cloned", priceMultiplier: 1, ...over,
});
const generic = () => makeAvatar({ personType: "generic", front: makeImage(GENERATED) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar());
  vi.mocked(updateAvatar).mockImplementation(async (_c, _a, p) => makeAvatar(p));
  vi.mocked(listClientVoiceIds).mockResolvedValue(["mine"]);
  vi.mocked(getVoiceCached).mockResolvedValue(picked());
});

describe("PUT avatar voice", () => {
  it("stores a named voice looked up on the account, conditioned on the front it was chosen for", async () => {
    const current = makeAvatar();
    vi.mocked(getAvatar).mockResolvedValue(current);
    const { PUT } = await import("./route");
    const res = await PUT(put({ mode: "named", voiceId: "mine" }), { params });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateAvatar).mock.calls[0][2]).toEqual({
      voice: { mode: "named", voiceId: "mine", name: "Acme · James", labels: { gender: "male" }, previewUrl: "https://x/p.mp3" },
    });
    expect(vi.mocked(updateAvatar).mock.calls[0][3]).toEqual({ ifFrontUrl: current.front!.url });
  });

  // D299 — a named voice gets its Seedance reference after the response, never in its way.
  it("schedules the voice reference after responding, for a named voice only", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar());
    const { PUT } = await import("./route");
    await PUT(put({ mode: "named", voiceId: "mine" }), { params });
    expect(after).toHaveBeenCalledTimes(1);
    expect(prepareNamedVoiceReference).not.toHaveBeenCalled(); // not before the response
    const task = vi.mocked(after).mock.calls[0][0];
    await (typeof task === "function" ? task() : task);
    expect(prepareNamedVoiceReference).toHaveBeenCalledWith("c1", expect.anything());

    vi.mocked(after).mockClear();
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ personType: "generic", front: makeImage(GENERATED) }));
    await PUT(put({ mode: "native" }), { params });
    expect(after).not.toHaveBeenCalled();
  });

  it("is a 404 for another client's voice, and for a voice no longer on the account", async () => {
    const { PUT } = await import("./route");
    vi.mocked(getVoiceCached).mockResolvedValue(picked({ voiceId: "theirs" }));
    expect((await PUT(put({ mode: "named", voiceId: "theirs" }), { params })).status).toBe(404);
    vi.mocked(getVoiceCached).mockResolvedValue(null);
    expect((await PUT(put({ mode: "named", voiceId: "gone" }), { params })).status).toBe(404);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("accepts a stock voice for any client", async () => {
    vi.mocked(getVoiceCached).mockResolvedValue(picked({ voiceId: "stock", category: "premade" }));
    vi.mocked(listClientVoiceIds).mockResolvedValue([]);
    const { PUT } = await import("./route");
    expect((await PUT(put({ mode: "named", voiceId: "stock" }), { params })).status).toBe(200);
  });

  it("lets a generated avatar use its engine's own voice", async () => {
    vi.mocked(getAvatar).mockResolvedValue(generic());
    const { PUT } = await import("./route");
    const res = await PUT(put({ mode: "native" }), { params });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateAvatar).mock.calls[0][2]).toEqual({ voice: { mode: "native" } });
  });

  it("lets a real person's avatar have a voice chosen for it too (D301)", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(put({ mode: "native" }), { params });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateAvatar).mock.calls[0][2]).toEqual({ voice: { mode: "native" } });
  });

  it("records a custom voice's origin", async () => {
    const { PUT } = await import("./route");
    await PUT(put({ mode: "named", voiceId: "mine", origin: "custom" }), { params });
    expect(vi.mocked(updateAvatar).mock.calls[0][2]).toMatchObject({ voice: { mode: "named", origin: "custom" } });
  });

  describe("the auto voice (D301)", () => {
    const withAuto = () => makeAvatar({ voice: { mode: "native", autoVoice: { voiceId: "auto1", sourceKey: "g1" } } });
    const runAfter = async () => {
      for (const [task] of vi.mocked(after).mock.calls) await (typeof task === "function" ? task() : task);
    };

    it("is kept when the voice chosen for the avatar is chosen again", async () => {
      vi.mocked(getAvatar).mockResolvedValue(withAuto());
      const { PUT } = await import("./route");
      await PUT(put({ mode: "native" }), { params });
      expect(vi.mocked(updateAvatar).mock.calls[0][2]).toEqual({ voice: withAuto().voice });
      await runAfter();
      expect(deleteVoice).not.toHaveBeenCalled();
    });

    it("is removed from the account once the voice moves to a named one, or to none", async () => {
      vi.mocked(getAvatar).mockResolvedValue(withAuto());
      vi.mocked(deleteVoice).mockResolvedValue(undefined);
      const { PUT } = await import("./route");
      await PUT(put({ mode: "named", voiceId: "mine" }), { params });
      await runAfter();
      expect(deleteVoice).toHaveBeenCalledWith("auto1");

      vi.mocked(deleteVoice).mockClear();
      vi.mocked(after).mockClear();
      await PUT(put({ mode: "none" }), { params });
      await runAfter();
      expect(deleteVoice).toHaveBeenCalledWith("auto1");
    });
  });

  it("needs a front image before a voice can be chosen", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ front: null, personType: null, status: "draft" }));
    const { PUT } = await import("./route");
    expect((await PUT(put({ mode: "native" }), { params })).status).toBe(400);
  });

  it("clears the voice", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(put({ mode: "none" }), { params });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateAvatar).mock.calls[0][2]).toEqual({ voice: null });
  });

  it("is a 409 when the front changed underneath the choice", async () => {
    vi.mocked(updateAvatar).mockResolvedValue(null);
    const { PUT } = await import("./route");
    expect((await PUT(put({ mode: "named", voiceId: "mine" }), { params })).status).toBe(409);
  });

  it("rejects an unknown mode", async () => {
    const { PUT } = await import("./route");
    expect((await PUT(put({ mode: "anchor" }), { params })).status).toBe(400);
  });
});
