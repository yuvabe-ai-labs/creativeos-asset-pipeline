import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  tts: vi.fn(async () => Buffer.from("RIFF")),
  upload: vi.fn(async () => ({ url: "u", path: "p" })),
  nodeType: { value: "dubbing" },
}));
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers");
  return { ...actual, withNode: (_r: Request, _p: unknown, fn: (...a: unknown[]) => Promise<Response>) => fn("n1", { type: mocks.nodeType.value }) };
});
vi.mock("@/lib/sarvam/client", () => ({ textToSpeech: mocks.tts }));
vi.mock("@/lib/storage", () => ({ publicUrlFor: (p: string) => `https://store/${p}`, uploadDubVoicePreview: mocks.upload }));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://x/api/nodes/n1/dub-voice-preview", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "n1" }) });
let stored = false;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nodeType.value = "dubbing";
  process.env.SARVAM_API_KEY = "k";
  stored = false;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: stored ? 200 : 404 })));
});

describe("POST /api/nodes/[id]/dub-voice-preview", () => {
  it("serves a stored preview without making a new one", async () => {
    stored = true;
    const res = await post({ voice: "ishita", language: "ta-IN" });
    expect(await res.json()).toEqual({ url: "https://store/dubbing/voice-previews/v1/ishita-ta-IN.wav" });
    expect(mocks.tts).not.toHaveBeenCalled();
  });

  it("makes and stores a preview the first time, in the dub language (English for Assamese)", async () => {
    const res = await post({ voice: "shubh", language: "as-IN" });
    expect(res.status).toBe(200);
    expect(mocks.tts).toHaveBeenCalledWith(expect.objectContaining({ language: "en-IN", speaker: "shubh" }));
    expect(mocks.upload).toHaveBeenCalledWith("dubbing/voice-previews/v1/shubh-en-IN.wav", expect.any(Buffer));
  });

  it("refuses an unknown voice, the presenter's voice and a node that is not Dubbing", async () => {
    expect((await post({ voice: "nobody", language: "ta-IN" })).status).toBe(400);
    expect((await post({ voice: "presenter", language: "ta-IN" })).status).toBe(400);
    mocks.nodeType.value = "video-gen";
    expect((await post({ voice: "ishita", language: "ta-IN" })).status).toBe(404);
    expect(mocks.tts).not.toHaveBeenCalled();
  });
});
