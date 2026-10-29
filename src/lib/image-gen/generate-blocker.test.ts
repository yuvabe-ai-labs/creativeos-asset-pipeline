import { describe, it, expect } from "vitest";
import { imageGenerateBlocker, imageGenerateDisabled } from "./generate-blocker";

const ok = { ok: true } as const;
const base = { editing: false, editable: true, hasPrompt: true, refValidation: ok };

describe("imageGenerateBlocker", () => {
  it("says nothing when Generate can run", () => {
    expect(imageGenerateBlocker(base)).toBeNull();
  });

  it("names the first thing in the way, in order", () => {
    expect(imageGenerateBlocker({ ...base, editing: true, editable: false })).toBe("An edit is already running.");
    expect(imageGenerateBlocker({ ...base, editable: false })).toBe("Another session is editing, so this canvas is read-only.");
    expect(imageGenerateBlocker({ ...base, hasPrompt: false })).toBe("Connect a Prompt node to generate.");
    expect(imageGenerateBlocker({ ...base, hasPrompt: false, missingInputReason: "Say what to make first." })).toBe("Say what to make first.");
  });

  it("counts the reference images a model cannot take", () => {
    const bad = (n: number) => ({ ok: false as const, violations: Array.from({ length: n }, () => ({}) as never) });
    expect(imageGenerateBlocker({ ...base, refValidation: bad(1) })).toMatch(/^A reference image doesn't meet/);
    expect(imageGenerateBlocker({ ...base, refValidation: bad(3) })).toMatch(/^3 reference images don't meet/);
  });
});

// Disabled is its own question: "Generating…" has no reason to show, yet must never be clickable
// (an extra click once charged for another image).
describe("imageGenerateDisabled", () => {
  it("disables while generating or estimating even with no reason", () => {
    expect(imageGenerateDisabled(null, true, false)).toBe(true);
    expect(imageGenerateDisabled(null, false, true)).toBe(true);
    expect(imageGenerateDisabled(null, false, false)).toBe(false);
    expect(imageGenerateDisabled("Say what to make first.", false, false)).toBe(true);
  });
});
