import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/scripts/copilot/model", () => ({ structuredCaller: vi.fn() }));

import type { StructuredCall } from "@/lib/scripts/copilot/model";
import type { ReviewField } from "../review";
import { questionMessage } from "../walk";
import { suggestAnswers, withAnswers } from "../answers";

const field = (over: Partial<ReviewField> = {}): ReviewField => ({
  path: "target_audience.age_range", module: "target_audience", label: "Age Range", title: "Audience & Casting · Age Range",
  kind: "text", value: null, inferred: false, status: "needs_review", ...over,
} as ReviewField);
const answering = (answers: string[]) => vi.fn(async () => ({ answers })) as unknown as StructuredCall & ReturnType<typeof vi.fn>;

describe("suggestAnswers (D533)", () => {
  it("keeps at most 4 short, distinct answers, never the walk's own buttons", async () => {
    const call = answering(["18–24", "25–34", "", "There is none", "25–34", "x".repeat(120), "35–44", "45+", "55+"]);
    expect(await suggestAnswers(field(), "KB", { call })).toEqual(["18–24", "25–34", "35–44", "45+"]);
  });

  it("gives nothing when the call fails or takes too long", async () => {
    const failing = vi.fn(async () => { throw new Error("down"); }) as unknown as StructuredCall;
    expect(await suggestAnswers(field(), "KB", { call: failing })).toEqual([]);
    const hanging = vi.fn(() => new Promise(() => {})) as unknown as StructuredCall;
    expect(await suggestAnswers(field(), "KB", { call: hanging, timeoutMs: 20 })).toEqual([]);
  });

  it("sends the field and the KB, and says the KB is data", async () => {
    const call = answering(["a"]);
    await suggestAnswers(field(), "Brand: Tamarind & Tide", { call });
    const sent = (call as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as { system: string; user: string };
    expect(sent.user).toContain("Audience & Casting · Age Range");
    expect(sent.user).toContain("Brand: Tamarind & Tide");
    expect(sent.system).toMatch(/data/i);
  });
});

describe("withAnswers (D533)", () => {
  it("adds answers only to questions about empty fields, one call each", async () => {
    const empty = field();
    const inferred = field({ path: "brand_voice.tone", title: "Tone", value: "Warm", inferred: true });
    const note = { role: "assistant" as const, content: "Built.", suggestions: [] };
    const call = answering(["18–24", "25–34"]);
    const out = await withAnswers([note, questionMessage(empty), questionMessage(inferred)], [empty, inferred], "KB", { call });
    expect(out[0]).toEqual(note);
    expect(out[1]).toEqual(questionMessage(empty, ["18–24", "25–34"]));
    expect(out[2]).toEqual(questionMessage(inferred));
    expect(call).toHaveBeenCalledTimes(1);
  });
});
