import { describe, it, expect, vi, afterEach } from "vitest";
import { submitLipSync, getFalStatus, getLipSyncResult } from "../client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => { delete process.env.FAL_KEY; });

describe("fal lip-sync client", () => {
  it("submits video + audio with the model and cut_off sync", async () => {
    process.env.FAL_KEY = "fk";
    const fetchImpl = vi.fn(async () => json({ request_id: "r1", status_url: "https://q/s", response_url: "https://q/r" }));
    const out = await submitLipSync({ videoUrl: "https://v.mp4", audioUrl: "https://a.mp3", model: "lipsync-2-pro" }, fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ requestId: "r1", statusUrl: "https://q/s", responseUrl: "https://q/r" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://queue.fal.run/fal-ai/sync-lipsync/v2");
    expect(init.headers).toEqual({ Authorization: "Key fk", "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ model: "lipsync-2-pro", video_url: "https://v.mp4", audio_url: "https://a.mp3", sync_mode: "cut_off" });
  });

  it("reads status and the result video url", async () => {
    process.env.FAL_KEY = "fk";
    const s = vi.fn(async () => json({ status: "IN_PROGRESS" }));
    expect(await getFalStatus("https://q/s", s as unknown as typeof fetch)).toBe("IN_PROGRESS");
    const r = vi.fn(async () => json({ video: { url: "https://out.mp4" } }));
    expect(await getLipSyncResult("https://q/r", r as unknown as typeof fetch)).toEqual({ videoUrl: "https://out.mp4" });
  });

  it("throws FalHttpError on a failed result", async () => {
    process.env.FAL_KEY = "fk";
    const r = vi.fn(async () => json({ detail: "face not found" }, 422));
    await expect(getLipSyncResult("https://q/r", r as unknown as typeof fetch)).rejects.toMatchObject({ name: "FalHttpError", status: 422 });
  });
});
