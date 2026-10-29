import { describe, it, expect } from "vitest";
import { TraceableBrandKBSchema } from "../schema";
import { FIELD_LABELS } from "../constants";
import { KB_EXTRACT_SYSTEM_PROMPT } from "@/prompts/kb-extract";
import { keepReviewedContentRules } from "../content-rules";
import type { TraceableBrandKB } from "../schema";

const field = (value: unknown, status: string) => ({ value, confidence: "high", evidence_type: "explicit", status });
const kb = (rules: unknown) => ({ compliance: { never_use_words: field(["cure"], "needs_review"), content_rules: rules } }) as unknown as TraceableBrandKB;

// Final review, Important 3: re-extracting a KB rebuilds every document section; Content Rules a
// person wrote or approved must survive it, as the house rules did in their old home.
describe("keepReviewedContentRules", () => {
  it("keeps Content Rules a person edited or approved over a fresh extraction", () => {
    const next = kb(field(null, "needs_review"));
    expect(keepReviewedContentRules(next, kb(field("HOUSE SPEC", "edited"))).compliance.content_rules?.value).toBe("HOUSE SPEC");
    expect(keepReviewedContentRules(next, kb(field("Sells flats.", "approved"))).compliance.content_rules?.value).toBe("Sells flats.");
  });

  it("takes the fresh extraction when the old one was never reviewed, or there was none", () => {
    const next = kb(field("New draft", "needs_review"));
    expect(keepReviewedContentRules(next, kb(field("Old draft", "needs_review"))).compliance.content_rules?.value).toBe("New draft");
    expect(keepReviewedContentRules(next, undefined).compliance.content_rules?.value).toBe("New draft");
    expect(keepReviewedContentRules(next, kb(undefined)).compliance.content_rules?.value).toBe("New draft");
  });

  it("leaves the rest of the fresh compliance section alone", () => {
    const out = keepReviewedContentRules(kb(field(null, "needs_review")), kb(field("HOUSE SPEC", "edited")));
    expect(out.compliance.never_use_words.value).toEqual(["cure"]);
  });
});

// Brand-neutral spec §3.5 — a client's script house rules get their own KB field, drafted by the
// extractor from the client's documents and reviewed by the team.
describe("Content Rules", () => {
  it("is a compliance field, so document extraction fills it", () => {
    expect(TraceableBrandKBSchema.shape.compliance.shape.content_rules).toBeDefined();
  });

  it("is labelled for the KB page", () => {
    expect(FIELD_LABELS.content_rules).toBe("Content Rules");
  });

  it("tells the extractor what goes in it and never to invent a claim", () => {
    expect(KB_EXTRACT_SYSTEM_PROMPT).toContain("content_rules");
    expect(KB_EXTRACT_SYSTEM_PROMPT).toContain("never invent a claim");
  });
});
