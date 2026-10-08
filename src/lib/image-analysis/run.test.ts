import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/jobs/db", () => ({
  getJob: vi.fn(),
  listRecentJobs: vi.fn(),
  startJob: vi.fn(),
  setJobPhase: vi.fn(),
  succeedJob: vi.fn(),
  failJob: vi.fn(),
}));
vi.mock("@/lib/db/kb", () => ({ getActiveKBVersion: vi.fn() }));
vi.mock("@/lib/db/image-cards", () => ({
  listImagesNeedingCards: vi.fn(),
  upsertImageCard: vi.fn(),
  listImageCards: vi.fn(),
  listCardImageIds: vi.fn(),
  setKBImageAnalysis: vi.fn(),
}));
vi.mock("./read-image", () => ({ readImageCard: vi.fn() }));
vi.mock("./gemini", () => ({ generateStructured: vi.fn() }));

import { failJob, getJob, listRecentJobs, succeedJob } from "@/lib/jobs/db";
import { getActiveKBVersion } from "@/lib/db/kb";
import { listCardImageIds, listImageCards, listImagesNeedingCards, setKBImageAnalysis, upsertImageCard } from "@/lib/db/image-cards";
import { defaultEmptyImageAnalysis } from "@/lib/kb/schema";
import { readImageCard } from "./read-image";
import { generateStructured } from "./gemini";
import { cardSetKey, runImageAnalysis } from "./run";
import type { ImageCard } from "./card-schema";

const CARD = {
  format: "product_shot",
  purpose: "promote",
  summary: "Pack",
  subjects: [],
  product: { visible: true, presentation: "packshot" },
  setting: null,
  background: "plain",
  background_note: null,
  composition: { shot_type: "close_up", angle: "eye_level", framing: "centred", note: "pack upright" },
  lighting: "studio",
  lighting_note: "soft",
  colours: [{ name: "green", hex: "#2F5D3A", share: 50 }],
  mood: [],
  style_tags: [],
  people: { count: 0, description: null },
  text_overlay: { present: false, text: null, font_style: null, font_note: null, colours_hex: [], placement: null, treatment: null, note: null },
  logo_visible: false,
  polish: "professional",
} as ImageCard;

const SUMMARY = {
  aesthetic: "Clean", visual_mood: "Calm", subjects: "Packs", product_presentation: "Packshots", composition_style: "Centred",
  lighting_character: "Soft", settings_backgrounds: "Studio", people_casting: "None", text_overlay_style: "None",
  recurring_motifs: [], brand_consistency_notes: "Consistent",
};

const image = (id: string) => ({ id, source: "upload" as const, storage_url: `https://gcs/${id}.jpg`, thumbnail_url: null, file_ext: "jpg" });
const version = (id: string, imageAnalysis = defaultEmptyImageAnalysis()) => ({ id, output: { image_analysis: imageAnalysis } }) as never;
const written = () => vi.mocked(setKBImageAnalysis).mock.calls[0]?.[1];

describe("runImageAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getJob).mockResolvedValue({ id: "job-1", client_id: "client-1", input: {} } as never);
    vi.mocked(listRecentJobs).mockResolvedValue([]);
    vi.mocked(getActiveKBVersion).mockResolvedValue(version("v-1"));
    vi.mocked(readImageCard).mockResolvedValue(CARD);
    vi.mocked(listImageCards).mockResolvedValue([{ imageId: "a", source: "upload", card: CARD }]);
    vi.mocked(listCardImageIds).mockResolvedValue(["a"]);
    vi.mocked(listImagesNeedingCards).mockResolvedValue([]);
    vi.mocked(generateStructured).mockResolvedValue(SUMMARY);
  });

  it("reads every image without a card, then writes the section to the active KB version", async () => {
    vi.mocked(listImagesNeedingCards).mockResolvedValueOnce([image("a"), image("b")]).mockResolvedValue([]);
    const result = await runImageAnalysis("job-1");
    expect(upsertImageCard).toHaveBeenCalledTimes(2);
    expect(setKBImageAnalysis).toHaveBeenCalledWith("v-1", expect.objectContaining({ aesthetic: expect.objectContaining({ value: "Clean" }) }));
    expect(result).toMatchObject({ read: 2, failed: 0, counted: 1, written: true, cardSetKey: cardSetKey(["a"]) });
    expect(succeedJob).toHaveBeenCalledWith("job-1", result, "Built from 1 image");
  });

  it("picks up images added while it was reading", async () => {
    vi.mocked(listImagesNeedingCards)
      .mockResolvedValueOnce([image("a")])
      .mockResolvedValueOnce([image("late")])
      .mockResolvedValue([]);
    const result = await runImageAnalysis("job-1");
    expect(result?.read).toBe(2);
  });

  it("keeps going when one image cannot be read, and stops when none can", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(readImageCard).mockImplementation(async (img) => {
      if (img.storage_url.includes("bad")) throw new Error("bad image");
      return CARD;
    });
    // Round 1 reads "ok" and fails "bad"; round 2 finds only "bad" again, reads nothing, and stops.
    vi.mocked(listImagesNeedingCards).mockResolvedValueOnce([image("bad"), image("ok")]).mockResolvedValueOnce([image("bad")]);
    const result = await runImageAnalysis("job-1");
    expect(result).toMatchObject({ read: 1, failed: 2 });
    expect(failJob).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("does not write when there is no KB version yet, and records no key", async () => {
    vi.mocked(getActiveKBVersion).mockResolvedValue(null);
    const result = await runImageAnalysis("job-1");
    expect(setKBImageAnalysis).not.toHaveBeenCalled();
    expect(result?.written).toBe(false);
    expect(result?.cardSetKey).toBeUndefined();
  });

  it("leaves an up-to-date section alone when no image changed", async () => {
    vi.mocked(listRecentJobs).mockResolvedValue([{ id: "job-0", status: "succeeded", result: { cardSetKey: cardSetKey(["a"]) } }] as never);
    vi.mocked(getActiveKBVersion).mockResolvedValue(version("v-1", { ...defaultEmptyImageAnalysis(), aesthetic: { value: "Clean", confidence: "high", evidence_type: "inferred", status: "approved" } }));
    await runImageAnalysis("job-1");
    expect(generateStructured).not.toHaveBeenCalled();
    expect(setKBImageAnalysis).not.toHaveBeenCalled();
    expect(succeedJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ written: false, cardSetKey: cardSetKey(["a"]) }), "Up to date with 1 image");
  });

  it("rewrites anyway when asked to (the tab's Refresh)", async () => {
    vi.mocked(getJob).mockResolvedValue({ id: "job-1", client_id: "client-1", input: { force: true } } as never);
    vi.mocked(listRecentJobs).mockResolvedValue([{ id: "job-0", status: "succeeded", result: { cardSetKey: cardSetKey(["a"]) } }] as never);
    await runImageAnalysis("job-1");
    expect(setKBImageAnalysis).toHaveBeenCalledTimes(1);
  });

  it("keeps the team's reviews in the version that is active when it writes", async () => {
    const reviewed = {
      ...defaultEmptyImageAnalysis(),
      aesthetic: { value: "Our words", confidence: "high" as const, evidence_type: "inferred" as const, status: "edited" as const },
    };
    // A re-extract made v-2 while the summary was being written.
    vi.mocked(getActiveKBVersion).mockResolvedValueOnce(version("v-1")).mockResolvedValue(version("v-2", reviewed));
    await runImageAnalysis("job-1");
    expect(setKBImageAnalysis).toHaveBeenCalledWith("v-2", expect.anything());
    expect(written()?.aesthetic).toMatchObject({ value: "Our words", status: "edited" });
    expect(written()?.visual_mood).toMatchObject({ value: "Calm", status: "needs_review" });
  });

  it("builds the section again when an image is deleted while it is written", async () => {
    vi.mocked(listImageCards)
      .mockResolvedValueOnce([
        { imageId: "a", source: "upload", card: CARD },
        { imageId: "b", source: "upload", card: CARD },
      ])
      .mockResolvedValue([{ imageId: "a", source: "upload", card: CARD }]);
    vi.mocked(listCardImageIds).mockResolvedValueOnce(["a"]).mockResolvedValue(["a"]);
    const result = await runImageAnalysis("job-1");
    expect(setKBImageAnalysis).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ counted: 1, cardSetKey: cardSetKey(["a"]) });
  });

  it("fails in plain words when the summary call breaks", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(generateStructured).mockRejectedValue(new Error("HTTP 503"));
    await runImageAnalysis("job-1");
    expect(failJob).toHaveBeenCalledWith("job-1", "The image analysis didn't finish. Try again in a few minutes.");
    log.mockRestore();
  });
});
