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
vi.mock("@/lib/db/copilot-messages", () => ({
  hasCopilotMessages: vi.fn(), insertCopilotMessages: vi.fn(),
  listPendingChangeCards: vi.fn(), listSettledChangeCards: vi.fn(), claimChangeCard: vi.fn(),
}));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/journey/thread/opening", () => ({ ensureOpening: vi.fn() }));
vi.mock("@/lib/journey/kb-copilot/job-failed", () => ({ sayJobFailed: vi.fn() }));

import { failJob, getJob, listRecentJobs, succeedJob } from "@/lib/jobs/db";
import { getActiveKBVersion } from "@/lib/db/kb";
import { listCardImageIds, listImageCards, listImagesNeedingCards, setKBImageAnalysis, upsertImageCard } from "@/lib/db/image-cards";
import { defaultEmptyImageAnalysis } from "@/lib/kb/schema";
import { claimChangeCard, hasCopilotMessages, insertCopilotMessages, listPendingChangeCards, listSettledChangeCards } from "@/lib/db/copilot-messages";
import { getClientById } from "@/lib/db/clients";
import { ensureOpening } from "@/lib/journey/thread/opening";
import type { ChangeCard } from "@/lib/journey/thread/schema";
import { readImageCard } from "./read-image";
import { sayJobFailed } from "@/lib/journey/kb-copilot/job-failed";
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
    vi.mocked(listPendingChangeCards).mockResolvedValue([]);
    vi.mocked(listSettledChangeCards).mockResolvedValue([]);
    vi.mocked(claimChangeCard).mockResolvedValue(true);
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1" } as never);
    vi.mocked(insertCopilotMessages).mockResolvedValue(undefined);
    vi.mocked(hasCopilotMessages).mockResolvedValue(true);
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
    expect(sayJobFailed).toHaveBeenCalledWith(expect.objectContaining({ client_id: "client-1", kind: "image-analysis" }));
    log.mockRestore();
  });

  describe("saying what a re-study changed", () => {
    const studied = { ...defaultEmptyImageAnalysis(), visual_mood: { value: "Busy", confidence: "high" as const, evidence_type: "inferred" as const, status: "needs_review" as const } };

    it("says in the client's thread which fields a re-study changed", async () => {
      vi.mocked(getActiveKBVersion).mockResolvedValue(version("v-1", studied));
      vi.mocked(hasCopilotMessages).mockResolvedValue(true);
      await runImageAnalysis("job-1");
      const [, , , messages] = vi.mocked(insertCopilotMessages).mock.calls[0];
      expect(messages[0]).toMatchObject({ role: "assistant", card: { kind: "note" } });
      expect(messages[0].content).toMatch(/^Studied the images again. Changed: .*Visual Mood/);
    });

    it("says nothing on the first study, or for a client with no thread yet", async () => {
      vi.mocked(hasCopilotMessages).mockResolvedValue(true);
      await runImageAnalysis("job-1");
      vi.mocked(getActiveKBVersion).mockResolvedValue(version("v-1", studied));
      vi.mocked(hasCopilotMessages).mockResolvedValue(false);
      await runImageAnalysis("job-1");
      expect(insertCopilotMessages).not.toHaveBeenCalled();
    });

    it("still succeeds when the thread cannot be written", async () => {
      vi.mocked(getActiveKBVersion).mockResolvedValue(version("v-1", studied));
      vi.mocked(hasCopilotMessages).mockResolvedValue(true);
      vi.mocked(insertCopilotMessages).mockRejectedValue(new Error("down"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      await runImageAnalysis("job-1");
      expect(succeedJob).toHaveBeenCalled();
    });
  });
});

// ── Piece 2b: a study proposes what it would change in a reviewed field ───────

describe("runImageAnalysis, proposing changes to reviewed fields", () => {
  const reviewedField = (value: string, status: "approved" | "needs_review" = "approved") => ({ value, confidence: "high" as const, evidence_type: "inferred" as const, status });
  const reviewed = (over: Record<string, unknown> = {}) => ({ ...defaultEmptyImageAnalysis(), aesthetic: reviewedField("Earthy"), ...over }) as ReturnType<typeof defaultEmptyImageAnalysis>;
  const cardMessages = () => vi.mocked(insertCopilotMessages).mock.calls.map((c) => c[3][0]).filter((m) => m.card?.kind === "change");
  const imageCard = (after: string): ChangeCard => ({
    kind: "change", versionId: "v-1", status: "pending", decision: null,
    fields: [{ path: "image_analysis.aesthetic", label: "Image Analysis · Aesthetic", before: "Earthy", after, from: "Image study", docId: null }],
  });
  const docCard: ChangeCard = {
    kind: "change", versionId: "v-1", status: "pending", decision: null,
    fields: [{ path: "brand_profile.tone_of_voice", label: "Tone", before: "Warm", after: "Plain", from: "guide.pdf", docId: "d1" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getJob).mockResolvedValue({ id: "job-1", client_id: "client-1", input: {} } as never);
    vi.mocked(listRecentJobs).mockResolvedValue([]);
    vi.mocked(getActiveKBVersion).mockResolvedValue(version("v-1", reviewed()));
    vi.mocked(listImageCards).mockResolvedValue([{ imageId: "a", source: "upload", card: CARD }]);
    vi.mocked(listCardImageIds).mockResolvedValue(["a"]);
    vi.mocked(listImagesNeedingCards).mockResolvedValue([]);
    vi.mocked(generateStructured).mockResolvedValue(SUMMARY);
    vi.mocked(listPendingChangeCards).mockResolvedValue([]);
    vi.mocked(listSettledChangeCards).mockResolvedValue([]);
    vi.mocked(claimChangeCard).mockResolvedValue(true);
    vi.mocked(getClientById).mockResolvedValue({ id: "client-1" } as never);
    vi.mocked(insertCopilotMessages).mockResolvedValue(undefined);
    vi.mocked(hasCopilotMessages).mockResolvedValue(true);
  });

  it("stores a reviewed field as it was and puts the new reading on a card", async () => {
    await runImageAnalysis("job-1");
    expect(written()?.aesthetic).toMatchObject({ value: "Earthy", status: "approved" });
    const [message] = cardMessages();
    expect(message.content).toBe("The new images read differently for a field you reviewed. Nothing changes until you approve.");
    expect(message.card).toMatchObject({ kind: "change", versionId: "v-1", status: "pending", fields: [{ path: "image_analysis.aesthetic", before: "Earthy", after: "Clean", from: "Image study" }] });
    expect(ensureOpening).toHaveBeenCalled();
  });

  it("names only the fields it changed directly in the thread line", async () => {
    vi.mocked(getActiveKBVersion).mockResolvedValue(version("v-1", reviewed({ visual_mood: reviewedField("Loud", "needs_review") })));
    await runImageAnalysis("job-1");
    const note = vi.mocked(insertCopilotMessages).mock.calls.map((c) => c[3][0]).find((m) => m.card?.kind === "note");
    expect(note?.content).toContain("Visual Mood");
    expect(note?.content).not.toContain("Aesthetic");
  });

  it("marks an earlier unanswered image-study card out of date, and leaves a document card alone", async () => {
    vi.mocked(listPendingChangeCards).mockResolvedValue([{ id: "m-old", card: imageCard("Bold") }, { id: "m-doc", card: docCard }]);
    await runImageAnalysis("job-1");
    expect(claimChangeCard).toHaveBeenCalledTimes(1);
    expect(claimChangeCard).toHaveBeenCalledWith("client-1", "m-old", expect.objectContaining({ status: "stale" }));
    expect(cardMessages()).toHaveLength(1);
  });

  it("marks the earlier card out of date even when it has nothing new to propose", async () => {
    vi.mocked(generateStructured).mockResolvedValue({ ...SUMMARY, aesthetic: "Earthy" });
    vi.mocked(listPendingChangeCards).mockResolvedValue([{ id: "m-old", card: imageCard("Bold") }]);
    await runImageAnalysis("job-1");
    expect(claimChangeCard).toHaveBeenCalledWith("client-1", "m-old", expect.objectContaining({ status: "stale" }));
    expect(cardMessages()).toHaveLength(0);
  });

  it("treats a field approved while the summary was being written as reviewed", async () => {
    vi.mocked(getActiveKBVersion)
      .mockResolvedValueOnce(version("v-1", reviewed({ aesthetic: reviewedField("Earthy", "needs_review") })))
      .mockResolvedValue(version("v-1", reviewed()));
    await runImageAnalysis("job-1");
    expect(written()?.aesthetic).toMatchObject({ value: "Earthy", status: "approved" });
    expect(cardMessages()).toHaveLength(1);
  });

  it("retires an earlier study's card before it writes, so the older reading cannot be approved meanwhile", async () => {
    vi.mocked(listPendingChangeCards).mockResolvedValue([{ id: "m-old", card: imageCard("Bold") }]);
    await runImageAnalysis("job-1");
    const order = (fn: unknown) => vi.mocked(fn as () => unknown).mock.invocationCallOrder[0];
    expect(order(claimChangeCard)).toBeLessThan(order(setKBImageAnalysis));
  });

  it("builds the card against what is stored when it writes it, not what it read earlier", async () => {
    // By the time the card is written, the field already says what the study would propose.
    vi.mocked(getActiveKBVersion)
      .mockResolvedValueOnce(version("v-1", reviewed()))
      .mockResolvedValueOnce(version("v-1", reviewed()))
      .mockResolvedValue(version("v-1", reviewed({ aesthetic: reviewedField("Clean") })));
    await runImageAnalysis("job-1");
    expect(cardMessages()).toHaveLength(0);
  });

  it("writes no card when the brand KB was rebuilt while the study ran", async () => {
    vi.mocked(getActiveKBVersion)
      .mockResolvedValueOnce(version("v-1", reviewed()))
      .mockResolvedValueOnce(version("v-1", reviewed()))
      .mockResolvedValue(version("v-2", reviewed()));
    await runImageAnalysis("job-1");
    expect(cardMessages()).toHaveLength(0);
  });

  it("does not propose a value the person already discarded for that field", async () => {
    vi.mocked(listSettledChangeCards).mockResolvedValue([{ ...imageCard("Clean"), status: "discarded", decision: { by: "Cyril", byId: null, at: "", kept: [], outOfDate: [] } }]);
    await runImageAnalysis("job-1");
    expect(cardMessages()).toHaveLength(0);
  });

  it("still stores the section and succeeds when the card cannot be written", async () => {
    vi.mocked(listPendingChangeCards).mockRejectedValue(new Error("thread down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runImageAnalysis("job-1");
    expect(setKBImageAnalysis).toHaveBeenCalled();
    expect(succeedJob).toHaveBeenCalledWith("job-1", result, expect.any(String));
    expect(failJob).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith("[image-analysis] could not write the change card", expect.anything());
    spy.mockRestore();
  });

  it("writes no card and touches no thread when the run wrote nothing", async () => {
    vi.mocked(listRecentJobs).mockResolvedValue([{ id: "job-0", status: "succeeded", result: { cardSetKey: cardSetKey(["a"]) } }] as never);
    await runImageAnalysis("job-1");
    expect(setKBImageAnalysis).not.toHaveBeenCalled();
    expect(listPendingChangeCards).not.toHaveBeenCalled();
    expect(cardMessages()).toHaveLength(0);
  });
});
