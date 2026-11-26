import { describe, it, expect, vi, beforeEach } from "vitest";

// D551 — the Omni provider hands back what Google billed, read off the interaction's `usage`.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { GEMINI_OMNI_12_MODEL_ID } from "@/lib/ai-models/model-ids";
import { runSeededVideoModel } from "./run-seeded-model";

const VIDEO_URI = "https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media";
const USAGE = {
  total_input_tokens: 5798,
  output_tokens_by_modality: [{ modality: "video", tokens: 5793 }],
  total_output_tokens: 5793,
  total_thought_tokens: 334,
};
const interaction = (usage?: unknown) => ({
  ok: true,
  json: async () => ({
    id: "int-1",
    status: "completed",
    steps: [{ type: "model_output", content: [{ type: "video", uri: VIDEO_URI }] }],
    ...(usage ? { usage } : {}),
  }),
});
const fileActive = { ok: true, json: async () => ({ state: "ACTIVE" }) };
const download = {
  ok: true,
  headers: new Headers({ "content-type": "video/mp4" }),
  arrayBuffer: async () => new ArrayBuffer(4),
};

describe("Gemini Omni usage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GOOGLE_GENAI_API_KEY = "test-key";
  });

  it("a generation returns the usage Google reported", async () => {
    mockFetch.mockResolvedValueOnce(interaction(USAGE)).mockResolvedValueOnce(fileActive);

    const result = await runSeededVideoModel(GEMINI_OMNI_12_MODEL_ID, {
      prompt: "An apple", referenceUrls: [], params: { duration: 3, resolution: "360p" },
    });
    expect(result.usage).toEqual({
      kind: "omni", inputTokens: 5798, videoOutputTokens: 5793, textOutputTokens: 0, thoughtTokens: 334,
    });
  });

  it("an edit returns the usage Google reported", async () => {
    mockFetch
      .mockResolvedValueOnce(download)
      .mockResolvedValueOnce(interaction(USAGE))
      .mockResolvedValueOnce(fileActive);

    const result = await runSeededVideoModel(GEMINI_OMNI_12_MODEL_ID, {
      prompt: "Make it green",
      referenceUrls: [],
      editVideoUrl: "https://storage.example/take.mp4",
      params: { durationSeconds: 3, resolution: "360p" },
    });
    expect(result.usage?.kind).toBe("omni");
    expect(result).toMatchObject({ videoUrl: VIDEO_URI, durationSeconds: 3 });
  });

  it("leaves usage out when Google sends none", async () => {
    mockFetch.mockResolvedValueOnce(interaction()).mockResolvedValueOnce(fileActive);

    const result = await runSeededVideoModel(GEMINI_OMNI_12_MODEL_ID, {
      prompt: "An apple", referenceUrls: [], params: { duration: 3, resolution: "360p" },
    });
    expect(result).toEqual({ videoUrl: VIDEO_URI, durationSeconds: 3 });
  });
});
