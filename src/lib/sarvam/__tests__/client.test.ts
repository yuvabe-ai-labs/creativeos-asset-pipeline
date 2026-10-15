import { describe, it, expect, vi, afterEach } from "vitest";
import { createDubJob, uploadDubMedia, startDubJob, getDubLiveStatus, getDubExports } from "../client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => { delete process.env.SARVAM_API_KEY; });

describe("sarvam client", () => {
  it("creates a cloned-voice job for one language and returns its id + upload url", async () => {
    process.env.SARVAM_API_KEY = "k";
    const fetchImpl = vi.fn(async () => json({ status: "success", message: "ok", data: { job_id: "dub_1", upload_url: "https://blob/up" } }));
    const out = await createDubJob({ srcLang: "en-IN", targetLang: "hi-IN", jobName: "gen-1" }, fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ jobId: "dub_1", uploadUrl: "https://blob/up" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.sarvam.ai/dubbing/jobs");
    expect((init.headers as Record<string, string>)["api-subscription-key"]).toBe("k");
    expect(JSON.parse(String(init.body))).toEqual({
      src_lang: "en-IN", target_langs: ["hi-IN"], voice_cloning: true, num_speakers: 1,
      disable_watermark: true, editor_flow: false, job_name: "gen-1",
    });
  });

  it("uploads raw bytes as a block blob without the api key", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    await uploadDubMedia("https://blob/up", Buffer.from([1]), "video/mp4", fetchImpl as unknown as typeof fetch);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "Content-Type": "video/mp4", "x-ms-blob-type": "BlockBlob" });
  });

  it("starts the job", async () => {
    process.env.SARVAM_API_KEY = "k";
    const fetchImpl = vi.fn(async () => json({ status: "success", message: "ok", data: { job_id: "dub_1", status: "processing" } }));
    await startDubJob("dub_1", fetchImpl as unknown as typeof fetch);
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe("https://api.sarvam.ai/dubbing/jobs/dub_1/start");
  });

  it("does not fail a started job just because the start reply names no job id", async () => {
    process.env.SARVAM_API_KEY = "k";
    for (const body of [{ status: "success" }, { data: {} }, null]) {
      const fetchImpl = vi.fn(async () => json(body));
      await expect(startDubJob("dub_1", fetchImpl as unknown as typeof fetch)).resolves.toBeUndefined();
    }
  });

  it("reads live status and export entries", async () => {
    process.env.SARVAM_API_KEY = "k";
    const live = vi.fn(async () => json({ status: "success", message: "", data: { job_id: "dub_1", status: "in_progress", progress: 40, current_step_label: "Translating", error_message: null } }));
    expect(await getDubLiveStatus("dub_1", live as unknown as typeof fetch)).toEqual({ status: "in_progress", progress: 40, stepLabel: "Translating", errorMessage: null });
    const exp = vi.fn(async () => json({ status: "success", message: "", data: { exports: [{ id: "e1", export_type: "video", target_language: "hi-IN", status: "completed", is_stale: false, download_url: "https://dl/v" }] } }));
    expect(await getDubExports("dub_1", exp as unknown as typeof fetch)).toEqual([{ exportType: "video", targetLanguage: "hi-IN", status: "completed", downloadUrl: "https://dl/v" }]);
    expect((exp.mock.calls[0] as unknown as [string])[0]).toBe("https://api.sarvam.ai/dubbing/jobs/dub_1/export-status?limit=20");
  });

  it("throws SarvamHttpError with the status on a non-2xx, and on an unexpected body", async () => {
    process.env.SARVAM_API_KEY = "k";
    const bad = vi.fn(async () => json({ error: { message: "nope" } }, 422));
    await expect(startDubJob("dub_1", bad as unknown as typeof fetch)).rejects.toMatchObject({ name: "SarvamHttpError", status: 422 });
    const weird = vi.fn(async () => json({ data: { nothing: true } }));
    await expect(getDubLiveStatus("dub_1", weird as unknown as typeof fetch)).rejects.toThrow(/unexpected/i);
  });

  it("refuses to run without a key", async () => {
    await expect(startDubJob("x", vi.fn() as unknown as typeof fetch)).rejects.toThrow("SARVAM_API_KEY is not set");
  });
});
