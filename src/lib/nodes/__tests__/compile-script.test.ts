import { describe, expect, it } from "vitest";
import { compileScript } from "@/lib/nodes/script";
import { scriptParsePrompt } from "@/prompts/script-parse";

const SRC = "Shot 1: hands apply cream.";
const CTX = "Tone of voice: warm";
const BRIEF = "Market signal: Rakshabandhan\nSibling gifting moments.";

describe("compileScript", () => {
  it("without a brief is byte-identical to the legacy composition", () => {
    expect(compileScript(SRC, CTX)).toEqual({
      system: scriptParsePrompt.system,
      user:
        "Client context (brand tone + compliance — do not introduce avoided words):\n" +
        `${CTX}\n\nReel script to extract:\n${SRC}`,
    });
    expect(compileScript(SRC, "").user).toBe(`Reel script to extract:\n${SRC}`);
  });

  it("places the brief and tint instruction between context and source", () => {
    const { user } = compileScript(SRC, CTX, BRIEF, "tint");
    const iCtx = user.indexOf("Client context");
    const iBrief = user.indexOf(BRIEF);
    const iMode = user.indexOf(scriptParsePrompt.signalModes.tint);
    const iSrc = user.indexOf("Reel script to extract:");
    expect(iCtx).toBeGreaterThanOrEqual(0);
    expect(iBrief).toBeGreaterThan(iCtx);
    expect(iMode).toBeGreaterThan(iBrief);
    expect(iSrc).toBeGreaterThan(iMode);
  });

  it("uses the rewrite instruction when asked", () => {
    const { user } = compileScript(SRC, CTX, BRIEF, "rewrite");
    expect(user).toContain(scriptParsePrompt.signalModes.rewrite);
    expect(user).not.toContain(scriptParsePrompt.signalModes.tint);
  });

  it("a whitespace-only brief composes exactly like no brief", () => {
    expect(compileScript(SRC, CTX, "  \n ", "tint")).toEqual(compileScript(SRC, CTX));
  });
});
