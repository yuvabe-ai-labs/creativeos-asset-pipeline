import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/client-voices", () => ({
  listClientVoiceIds: vi.fn(), addClientVoice: vi.fn(), removeClientVoice: vi.fn(),
  countOtherClientsWithVoice: vi.fn(), listLiveAvatarNamesUsingVoice: vi.fn(),
}));
vi.mock("@/lib/elevenlabs/voices-cache", () => ({
  getAccountVoicesCached: vi.fn(), getVoiceCached: vi.fn(), invalidateAccountVoices: vi.fn(),
}));
vi.mock("@/lib/elevenlabs/voice-catalog", () => ({
  saveLibraryVoice: vi.fn(), cloneVoice: vi.fn(), deleteVoice: vi.fn(),
}));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import {
  addClientVoice, countOtherClientsWithVoice, listClientVoiceIds, listLiveAvatarNamesUsingVoice,
  removeClientVoice,
} from "@/lib/db/client-voices";
import { getAccountVoicesCached, getVoiceCached, invalidateAccountVoices } from "@/lib/elevenlabs/voices-cache";
import { cloneVoice, deleteVoice, saveLibraryVoice } from "@/lib/elevenlabs/voice-catalog";
import { ElevenLabsHttpError } from "@/lib/elevenlabs/client";

const voice = (over: Partial<PickerVoice>): PickerVoice => ({
  voiceId: "v", source: "account", name: "n", description: null, previewUrl: null,
  labels: {}, category: "premade", priceMultiplier: 1, ...over,
});
const STOCK = voice({ voiceId: "stock", name: "Aria" });
const MINE = voice({ voiceId: "mine", name: "Acme · James", category: "cloned" });
const THEIRS = voice({ voiceId: "theirs", name: "Other · Clone", category: "cloned" });

const params = Promise.resolve({ id: "c1" });
const base = "http://localhost/api/clients/c1/voices";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-9", orgId: "org-1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  vi.mocked(getAccountVoicesCached).mockResolvedValue([STOCK, MINE, THEIRS]);
  vi.mocked(listClientVoiceIds).mockResolvedValue(["mine"]);
});

describe("GET voices", () => {
  it("lists this client's voices and the stock ones, never another client's", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(base), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.voices.map((v: PickerVoice) => v.voiceId)).toEqual(["stock", "mine"]);
    expect(json.nextCursor).toBeNull();
  });

  it("is a 404 for a client in another org", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-2" } as never);
    const { GET } = await import("./route");
    expect((await GET(new NextRequest(base), { params })).status).toBe(404);
    expect(listClientVoiceIds).not.toHaveBeenCalled();
  });
});

describe("POST voices/save", () => {
  const body = { publicOwnerId: "own", voiceId: "lib1", name: "Surabhi" };
  const post = () =>
    new NextRequest(`${base}/save`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

  it("saves a Library voice to the account and records it for the client", async () => {
    const saved = voice({ voiceId: "acct1", name: "Surabhi", category: "professional", originalVoiceId: "lib1" });
    vi.mocked(saveLibraryVoice).mockResolvedValue("acct1");
    vi.mocked(getVoiceCached).mockResolvedValue(saved);
    const { POST } = await import("./save/route");
    const res = await POST(post(), { params });
    expect(res.status).toBe(200);
    expect(addClientVoice).toHaveBeenCalledWith({
      clientId: "c1", voiceId: "acct1", name: "Surabhi", source: "library", userId: "user-9",
    });
  });

  it("reuses a copy already on the account, and still records it for this client", async () => {
    const existing = voice({ voiceId: "acct1", name: "Surabhi", category: "professional", originalVoiceId: "lib1" });
    vi.mocked(getAccountVoicesCached).mockResolvedValue([existing]);
    const { POST } = await import("./save/route");
    await POST(post(), { params });
    expect(saveLibraryVoice).not.toHaveBeenCalled();
    expect(addClientVoice).toHaveBeenCalledWith(expect.objectContaining({ clientId: "c1", voiceId: "acct1" }));
  });

  it("says what to do when the account's voice slots are full", async () => {
    vi.mocked(getAccountVoicesCached).mockResolvedValue([]);
    vi.mocked(saveLibraryVoice).mockRejectedValue(
      new ElevenLabsHttpError(400, '{"detail":{"status":"voice_limit_reached"}}', "voice save"),
    );
    const { POST } = await import("./save/route");
    const res = await POST(post(), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/no free voice slots/);
    expect(addClientVoice).not.toHaveBeenCalled();
  });
});

describe("POST voices/clone", () => {
  const form = (over: Record<string, string> = {}, file = new File([new Uint8Array(10)], "james.mp3", { type: "audio/mpeg" })) => {
    const fd = new FormData();
    fd.set("name", "James");
    fd.set("consent", "true");
    fd.set("removeBackgroundNoise", "true");
    for (const [k, v] of Object.entries(over)) fd.set(k, v);
    fd.append("files", file);
    return new NextRequest(`${base}/clone`, { method: "POST", body: fd });
  };

  it("clones under the client's name, records it as the client's, and returns the voice", async () => {
    vi.mocked(cloneVoice).mockResolvedValue("new1");
    vi.mocked(getVoiceCached).mockResolvedValue(voice({ voiceId: "new1", name: "Acme · James", category: "cloned" }));
    const { POST } = await import("./clone/route");
    const res = await POST(form(), { params });
    expect(res.status).toBe(201);
    expect(vi.mocked(cloneVoice).mock.calls[0][0]).toMatchObject({ name: "Acme · James", removeBackgroundNoise: true });
    expect(vi.mocked(cloneVoice).mock.calls[0][0].files).toHaveLength(1);
    expect(addClientVoice).toHaveBeenCalledWith({
      clientId: "c1", voiceId: "new1", name: "James", source: "clone", userId: "user-9",
    });
    expect(invalidateAccountVoices).toHaveBeenCalledWith("new1");
  });

  it("refuses without the speaker's permission, before calling ElevenLabs", async () => {
    const { POST } = await import("./clone/route");
    const res = await POST(form({ consent: "false" }), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/permission/);
    expect(cloneVoice).not.toHaveBeenCalled();
  });

  it("refuses a non-audio file", async () => {
    const { POST } = await import("./clone/route");
    const res = await POST(form({}, new File([new Uint8Array(10)], "clip.mp4", { type: "video/mp4" })), { params });
    expect(res.status).toBe(400);
    expect(cloneVoice).not.toHaveBeenCalled();
  });
});

describe("DELETE voices/:voiceId", () => {
  const del = (voiceId: string) =>
    [new NextRequest(`${base}/${voiceId}`, { method: "DELETE" }), { params: Promise.resolve({ id: "c1", voiceId }) }] as const;

  beforeEach(() => {
    vi.mocked(listLiveAvatarNamesUsingVoice).mockResolvedValue([]);
    vi.mocked(countOtherClientsWithVoice).mockResolvedValue(0);
    vi.mocked(removeClientVoice).mockResolvedValue(true);
  });

  it("removes the client's voice and frees the ElevenLabs slot", async () => {
    const { DELETE } = await import("./[voiceId]/route");
    const res = await DELETE(...del("mine"));
    expect(res.status).toBe(200);
    expect(deleteVoice).toHaveBeenCalledWith("mine");
    expect(removeClientVoice).toHaveBeenCalledWith("c1", "mine");
  });

  it("is a 404 for another client's voice, touching nothing", async () => {
    const { DELETE } = await import("./[voiceId]/route");
    const res = await DELETE(...del("theirs"));
    expect(res.status).toBe(404);
    expect(deleteVoice).not.toHaveBeenCalled();
    expect(removeClientVoice).not.toHaveBeenCalled();
  });

  it("refuses while a live avatar uses the voice, naming it", async () => {
    vi.mocked(listLiveAvatarNamesUsingVoice).mockResolvedValue(["Riya"]);
    const { DELETE } = await import("./[voiceId]/route");
    const res = await DELETE(...del("mine"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/used by Riya/);
    expect(deleteVoice).not.toHaveBeenCalled();
  });

  it("keeps the ElevenLabs voice when another client has it too", async () => {
    vi.mocked(countOtherClientsWithVoice).mockResolvedValue(1);
    const { DELETE } = await import("./[voiceId]/route");
    await DELETE(...del("mine"));
    expect(deleteVoice).not.toHaveBeenCalled();
    expect(removeClientVoice).toHaveBeenCalledWith("c1", "mine");
  });

  it("keeps the record when ElevenLabs refuses the removal", async () => {
    vi.mocked(deleteVoice).mockRejectedValue(new ElevenLabsHttpError(500, "boom", "voice removal"));
    const { DELETE } = await import("./[voiceId]/route");
    const res = await DELETE(...del("mine"));
    expect(res.status).toBe(502);
    expect(removeClientVoice).not.toHaveBeenCalled();
  });
});
