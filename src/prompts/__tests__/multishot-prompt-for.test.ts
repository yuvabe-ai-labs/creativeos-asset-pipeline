import { describe, it, expect } from "vitest";
import { multishotPromptFor } from "../multishot-prompt-for";
import {
  GEMINI_OMNI_MODEL_ID,
  KLING_OMNI_MODEL_ID,
  SEEDANCE_MODEL_ID,
} from "@/lib/video-gen/client-models";

// D236 — the bug this router exists to make unrepresentable: two models sharing one writer object,
// which is exactly how Omni's prompt used to leak into a Kling (or now Seedance) plan. The same
// assertion Task 2 pins for the single-shot lane (video-prompt-generate.test.ts), for the same
// reason, now that there are three multishot writers instead of two.
describe("multishotPromptFor", () => {
  it("gives every target model its own writer — no two share an object or an id", () => {
    const targets = [GEMINI_OMNI_MODEL_ID, KLING_OMNI_MODEL_ID, SEEDANCE_MODEL_ID];
    const specs = targets.map((t) => multishotPromptFor(t));
    expect(new Set(specs).size).toBe(targets.length);
    expect(new Set(specs.map((s) => s.id)).size).toBe(targets.length);
  });
});
