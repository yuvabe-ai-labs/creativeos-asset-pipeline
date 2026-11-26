import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/moodboards", () => ({ setItemReading: vi.fn() }));
vi.mock("@/lib/image-analysis/gemini", () => ({ generateStructured: vi.fn() }));

import { setItemReading } from "@/lib/db/moodboards";
import type { MoodboardItem } from "@/lib/db/moodboards";
import { MARKET_READ_MODEL } from "../constants";
import { readPost, type PostReading } from "../read-post";

// D530 step 3: each post is read once (the media where archived, else its thumbnail and caption).

const item = (over: Partial<MoodboardItem> = {}): MoodboardItem => ({
  id: "i1", moodboard_id: "b", image_url: "https://instagram.com/p/A/", source_url: null, kind: "instagram",
  note: "@minimalist · Rain at the window, then the serum", added_by: null, thumbnail_url: "https://cdn/t.jpg", position: 0, added_at: "",
  media_url: null, media_bytes: null, media_type: null, archive_status: "pending", archive_error: null, archive_attempts: 0,
  archive_started_at: null, archived_at: null, ...over,
});
const answer = { hook: "Rain on glass", format: "Talking head", pacing: "Fast cuts", onScreenText: "Monsoon skin?", setting: "Bedroom window", occasion: "Monsoon", summary: "A routine in the rain." };
const bytes = (type: string) => vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": type } }));

beforeEach(() => vi.resetAllMocks());

describe("readPost", () => {
  it("reads a post without archived media from its thumbnail", async () => {
    const generate = vi.fn().mockResolvedValue(answer);
    const fetchImpl = bytes("image/jpeg");
    const reading = await readPost(item(), { generate, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith("https://cdn/t.jpg");
    expect(reading).toEqual({ handle: "minimalist", caption: "Rain at the window, then the serum", ...answer, from: "thumbnail" });
    const args = generate.mock.calls[0][0];
    expect(args.model).toBe(MARKET_READ_MODEL);
    expect(args.parts[1]).toEqual({ inlineData: { mimeType: "image/jpeg", data: Buffer.from([1, 2, 3]).toString("base64") } });
    expect(setItemReading).toHaveBeenCalledWith("i1", reading);
  });

  it("reads the archived video itself when it is ready", async () => {
    const generate = vi.fn().mockResolvedValue(answer);
    const fetchImpl = bytes("video/mp4");
    const reading = await readPost(item({ archive_status: "ready", media_url: "https://store/v.mp4", media_type: "video/mp4", media_bytes: 3 }), { generate, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith("https://store/v.mp4");
    expect(reading.from).toBe("media");
    expect(generate.mock.calls[0][0].parts[1].inlineData.mimeType).toBe("video/mp4");
  });

  it("falls back to the thumbnail when the media is too big to send", async () => {
    const generate = vi.fn().mockResolvedValue(answer);
    const fetchImpl = bytes("image/jpeg");
    const reading = await readPost(item({ archive_status: "ready", media_url: "https://store/v.mp4", media_type: "video/mp4", media_bytes: 50 * 1024 * 1024 }), { generate, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith("https://cdn/t.jpg");
    expect(reading.from).toBe("thumbnail");
  });

  it("returns a cached reading without calling the model", async () => {
    const cached: PostReading = { handle: "x", caption: "", ...answer, from: "media" };
    const generate = vi.fn();
    expect(await readPost(item({ reading: cached }), { generate })).toBe(cached);
    expect(generate).not.toHaveBeenCalled();
    expect(setItemReading).not.toHaveBeenCalled();
  });

  it("still returns a paid-for reading it could not keep (0067 not applied yet)", async () => {
    vi.mocked(setItemReading).mockRejectedValue(new Error("column moodboard_items.reading does not exist"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const generate = vi.fn().mockResolvedValue(answer);
    const reading = await readPost(item(), { generate, fetchImpl: bytes("image/jpeg") });
    expect(reading.hook).toBe("Rain on glass");
  });

  it("reads the caption alone when there is no picture at all", async () => {
    const generate = vi.fn().mockResolvedValue(answer);
    const reading = await readPost(item({ thumbnail_url: null }), { generate, fetchImpl: vi.fn() });
    expect(generate.mock.calls[0][0].parts).toHaveLength(1);
    expect(reading.from).toBe("thumbnail");
  });
});
