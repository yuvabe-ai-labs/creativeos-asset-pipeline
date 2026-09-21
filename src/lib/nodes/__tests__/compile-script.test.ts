import { describe, expect, it } from "vitest";
import { compileScript } from "@/lib/nodes/script";
import { scriptParsePrompt } from "@/prompts/script-parse";

const SRC = "Shot 1: hands apply cream.";
const CTX = "Tone of voice: warm";
const BRIEF = "Market signal: Rakshabandhan\nSibling gifting moments.";

describe("compileScript", () => {
  // The split that matters: the user message holds DATA (the market brief and the
  // script), the system message holds INSTRUCTIONS. A rule left in the user message
  // is outranked by the system prompt — that is what made the signal flavour a
  // no-op in 11/13 measured parses.
  it("puts the brief and the source in the user message, and nothing else", () => {
    const { user } = compileScript(SRC, CTX, BRIEF, "tint");
    expect(user).toBe(`${BRIEF}\n\nReel script to extract:\n${SRC}`);
    expect(user).not.toContain(CTX);
    expect(user).not.toContain(scriptParsePrompt.signalModes.tint);
  });

  it("reduces to just the source when there is no brief", () => {
    expect(compileScript(SRC, CTX).user).toBe(`Reel script to extract:\n${SRC}`);
    expect(compileScript(SRC, "").user).toBe(`Reel script to extract:\n${SRC}`);
  });

  it("a whitespace-only brief composes exactly like no brief", () => {
    expect(compileScript(SRC, CTX, "  \n ", "tint")).toEqual(compileScript(SRC, CTX));
  });

  it("states the mode instruction in the system message when a brief is present", () => {
    const { system } = compileScript(SRC, CTX, BRIEF, "tint");
    expect(system).toContain(scriptParsePrompt.system);
    expect(system).toContain(scriptParsePrompt.signalModes.tint);
    expect(system).not.toContain(scriptParsePrompt.signalModes.rewrite);
  });

  it("carries the rewrite instruction into the system message", () => {
    const { system } = compileScript(SRC, CTX, BRIEF, "rewrite");
    expect(system).toContain(scriptParsePrompt.signalModes.rewrite);
    expect(system).not.toContain(scriptParsePrompt.signalModes.tint);
  });

  // COMPLIANCE FIRST. Ranking a market signal above the client's compliance text
  // would be the same precedence bug that made the flavour a no-op, aimed at the
  // client's legal lines — and rewrite mode rewrites captions.
  describe("compliance precedence", () => {
    it("puts the client context and its precedence rule above the mode instruction", () => {
      const { system } = compileScript(SRC, CTX, BRIEF, "rewrite");
      const iBase = system.indexOf(scriptParsePrompt.system);
      const iCtx = system.indexOf(scriptParsePrompt.clientContextHeading);
      const iCtxBody = system.indexOf(CTX);
      const iFirst = system.indexOf(scriptParsePrompt.complianceFirst);
      const iMode = system.indexOf(scriptParsePrompt.signalModes.rewrite);
      expect(iBase).toBe(0);
      expect(iCtx).toBeGreaterThan(iBase);
      expect(iCtxBody).toBeGreaterThan(iCtx);
      expect(iFirst).toBeGreaterThan(iCtxBody);
      expect(iMode).toBeGreaterThan(iFirst);
    });

    it("states the precedence rule even with a signal but no client context", () => {
      const { system } = compileScript(SRC, "", BRIEF, "rewrite");
      expect(system).toContain(scriptParsePrompt.complianceFirst);
      expect(system).not.toContain(scriptParsePrompt.clientContextHeading);
      expect(system.indexOf(scriptParsePrompt.complianceFirst)).toBeLessThan(
        system.indexOf(scriptParsePrompt.signalModes.rewrite),
      );
    });

    it("states it for an unflavoured parse that still carries client context", () => {
      const { system } = compileScript(SRC, CTX);
      expect(system).toContain(scriptParsePrompt.clientContextHeading);
      expect(system).toContain(scriptParsePrompt.complianceFirst);
      expect(system).not.toContain(scriptParsePrompt.signalModes.tint);
    });
  });

  // No KB context and no signal is the same bare prompt it has always been, so a
  // plain extraction is untouched by any of this.
  it("leaves the system message untouched with neither context nor brief", () => {
    expect(compileScript(SRC, "").system).toBe(scriptParsePrompt.system);
    expect(compileScript(SRC, "  ", "  \n ", "rewrite").system).toBe(scriptParsePrompt.system);
  });
});
