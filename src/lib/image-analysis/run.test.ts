import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/jobs/db", () => ({
  getJob: vi.fn(),
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
  setKBImageAnalysis: vi.fn(),
}));
vi.mock("./read-image", () => ({ readImageCard: vi.fn() }));
vi.mock("./gemini", () => ({ generateStructured: vi.fn() }));

import { failJob, getJob, succeedJob } from "@/lib/jobs/db";
import { getActiveKBVersion } from "@/lib/db/kb";
import { listImageCards, listImagesNeedingCards, setKBImageAnalysis, upsertImageCard } from "@/lib/db/image-cards";
import { readImageCard } from "./read-image";
import { generateStructured } from "./gemini";
import { runImageAnalysis } from "./run";
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

const image = (id: string) => ({ id, source: "upload" as const, storage_url: `https://gcs/${id}.jpg`, thumbnail_url: null, file_ext: "jpg" });

describe("runImageAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getJob).mockResolvedValue({ id: "job-1", client_id: "client-1" } as never);
    vi.mocked(getActiveKBVersion).mockResolvedValue({ id: "v-1" } as never);
    vi.mocked(readImageCard).mockResolvedValue(CARD);
    vi.mocked(listImageCards).mockResolvedValue([{ imageId: "a", source: "upload", card: CARD }]);
    vi.mocked(generateStructured).mockResolvedValue({
      aesthetic: "Clean", visual_mood: "Calm", subjects: "Packs", product_presentation: "Packshots", composition_style: "Centred",
      lighting_character: "Soft", settings_backgrounds: "Studio", people_casting: "None", text_overlay_style: "None",
      recurring_motifs: [], brand_consistency_notes: "Consistent",
    });
  });

  it("reads every image without a card, then writes the section to the active KB version", async () => {
    vi.mocked(listImagesNeedingCards).mockResolvedValueOnce([image("a"), image("b")]).mockResolvedValueOnce([]);
    const result = await runImageAnalysis("job-1");
    expect(upsertImageCard).toHaveBeenCalledTimes(2);
    expect(setKBImageAnalysis).toHaveBeenCalledWith("v-1", expect.objectContaining({ aesthetic: expect.objectContaining({ value: "Clean" }) }));
    expect(result).toMatchObject({ read: 2, failed: 0, counted: 1, written: true });
    expect(succeedJob).toHaveBeenCalledWith("job-1", result, "Built from 1 image");
  });

  it("picks up images added while it was reading", async () => {
    vi.mocked(listImagesNeedingCards)
      .mockResolvedValueOnce([image("a")])
      .mockResolvedValueOnce([image("late")])
      .mockResolvedValueOnce([]);
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
    vi.mocked(listImagesNeedingCards).mockResolvedValueOnce([image("bad"), image("ok")]).mockResolvedValue([image("bad")]);
    const result = await runImageAnalysis("job-1");
    expect(result).toMatchObject({ read: 1, failed: 2 });
    expect(failJob).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("does not write when there is no KB version yet", async () => {
    vi.mocked(getActiveKBVersion).mockResolvedValue(null);
    vi.mocked(listImagesNeedingCards).mockResolvedValue([]);
    const result = await runImageAnalysis("job-1");
    expect(setKBImageAnalysis).not.toHaveBeenCalled();
    expect(result?.written).toBe(false);
  });

  it("fails in plain words when the summary call breaks", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(listImagesNeedingCards).mockResolvedValue([]);
    vi.mocked(generateStructured).mockRejectedValue(new Error("gemini-3.5-flash-lite HTTP 503"));
    await runImageAnalysis("job-1");
    expect(failJob).toHaveBeenCalledWith("job-1", "The image analysis didn't finish. Try again in a few minutes.");
    log.mockRestore();
  });
});
