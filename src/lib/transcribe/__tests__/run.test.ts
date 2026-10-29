import { describe, expect, it, vi } from "vitest";
import { TranscribeError } from "../elevenlabs";
import { runTranscription } from "../run";

const input = { canvasId: "cv", nodeId: "n", generationId: "g", orgId: "o", files: [{ url: "a", seconds: 8 }, { url: "b", seconds: 4 }, { url: "c", seconds: 9 }] };
const words = [{ t: "hi", s: 0, e: 0.2, p: 1 }];

describe("runTranscription", () => {
  it("saves each file as it lands and reports the ones that failed", async () => {
    const save = vi.fn(async () => {});
    const transcribe = vi.fn(async (url: string) => {
      if (url === "b") throw new TranscribeError("no-speech", true, "empty");
      return { language: "eng", words };
    });
    const r = await runTranscription(input, { transcribe, save });
    expect(save).toHaveBeenCalledTimes(2);
    expect(vi.mocked(save).mock.calls[0]).toEqual([{ url: "a", language: "eng", words, engine: "elevenlabs", model: "scribe_v2", durationSeconds: 8 }]);
    expect(r.result.failed).toEqual([{ url: "b", reason: "no-speech" }]);
    expect(r.secondsDone).toBe(17);
  });

  it("tries a network error once more, never a call the engine answered", async () => {
    let calls = 0;
    const flaky = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new TranscribeError("failed", false, "down");
      return { language: "eng", words };
    });
    const r = await runTranscription({ ...input, files: [input.files[0]] }, { transcribe: flaky, save: async () => {} });
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(r.result.failed).toEqual([]);

    const answered = vi.fn(async () => {
      throw new TranscribeError("failed", true, "422");
    });
    const r2 = await runTranscription({ ...input, files: [input.files[0]] }, { transcribe: answered, save: async () => {} });
    expect(answered).toHaveBeenCalledTimes(1);
    expect(r2.result.failed).toEqual([{ url: "a", reason: "failed" }]);
  });

  it("counts a file whose save failed as failed, so it isn't charged", async () => {
    const r = await runTranscription({ ...input, files: [input.files[0]] }, { transcribe: async () => ({ language: "eng", words }), save: async () => { throw new Error("db"); } });
    expect(r.secondsDone).toBe(0);
    expect(r.result.failed).toEqual([{ url: "a", reason: "failed" }]);
  });
});
