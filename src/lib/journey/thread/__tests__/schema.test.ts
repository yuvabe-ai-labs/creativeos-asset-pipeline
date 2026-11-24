import { describe, expect, it } from "vitest";
import { threadCardSchema, type BrandsCard, type SignalDraftCard } from "../schema";

// D530: the market research agent's two cards live in the same thread as every other card.

const brands: BrandsCard = {
  kind: "brands", status: "pending", focus: null, jobId: null,
  brands: [
    { handle: "minimalist", name: "Minimalist", why: "Same buyer, same category.", group: "direct", keep: true },
    { handle: "sleepyowl", name: "Sleepy Owl", why: "The audience follows them.", group: "adjacent", keep: false },
  ],
};

const draft: SignalDraftCard = {
  kind: "signal-draft", status: "pending", name: "Monsoon rituals", tags: ["monsoon"],
  description: "Reels open on rain at a window.", itemIds: ["i1", "i2"],
  thumbs: [{ itemId: "i1", url: null, handle: "minimalist" }, { itemId: "i2", url: "https://x/t.jpg", handle: "sleepyowl" }],
  signalId: null,
};

describe("the market cards", () => {
  it("a brands card parses as a thread card", () => {
    expect(threadCardSchema.parse(brands)).toEqual(brands);
  });

  it("a signal-draft card parses as a thread card", () => {
    expect(threadCardSchema.parse(draft)).toEqual(draft);
  });

  it("rejects a brand in a group that is neither Direct nor Adjacent", () => {
    const bad = { ...brands, brands: [{ ...brands.brands[0], group: "custom" }] };
    expect(threadCardSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a brands card in an unknown status", () => {
    expect(threadCardSchema.safeParse({ ...brands, status: "done" }).success).toBe(false);
  });
});
