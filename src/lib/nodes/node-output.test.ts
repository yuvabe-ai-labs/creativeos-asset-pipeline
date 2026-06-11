import { describe, it, expect } from "vitest";
import { getNodeOutput } from "./node-output";

describe("getNodeOutput", () => {
  it("returns a text node's data.text", () => {
    expect(getNodeOutput({ type: "text", data: { text: "  hello  " }, activeOutput: null })).toBe("hello");
  });

  it("returns a shot node's description", () => {
    expect(getNodeOutput({ type: "shot", data: { description: "  Turmeric root  " }, activeOutput: null })).toBe("Turmeric root");
  });

  it("returns a prompt node's active output string", () => {
    expect(getNodeOutput({ type: "prompt", data: {}, activeOutput: "a cinematic shot" })).toBe("a cinematic shot");
  });

  it("renders a script node's parsed output as labeled text", () => {
    const out = getNodeOutput({
      type: "script",
      data: {},
      activeOutput: { title: "Reel A", strategic_objective: "Sell calm", visual_script: { shots: [{ description: "Turmeric root", duration: "3s" }] } },
    });
    expect(out).toContain("Title: Reel A");
    expect(out).toContain("Objective: Sell calm");
    expect(out).toContain("1. Turmeric root (3s)");
  });

  it("returns empty string for null output", () => {
    expect(getNodeOutput({ type: "script", data: {}, activeOutput: null })).toBe("");
    expect(getNodeOutput({ type: "text", data: {}, activeOutput: null })).toBe("");
  });
});
