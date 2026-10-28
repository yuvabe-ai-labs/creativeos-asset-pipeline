import { describe, it, expect } from "vitest";
import { TraceableBrandKBSchema } from "../schema";
import { FIELD_LABELS } from "../constants";
import { KB_EXTRACT_SYSTEM_PROMPT } from "@/prompts/kb-extract";

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
