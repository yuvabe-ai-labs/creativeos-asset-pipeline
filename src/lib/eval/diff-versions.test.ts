import { describe, it, expect } from "vitest";
import { diffVersions } from "@/lib/eval/diff-versions";
import type { TraceVersion } from "@/lib/eval/node-traces";

const base = {
  versionId: "x", createdAt: "", input: {}, output: { kind: "text" as const, text: "" },
  request: null, decision: null, note: null,
  instruction: "", controls: { lens: "auto" }, kbSlices: ["Tone"],
  upstream: [{ nodeId: "s", versionId: "sv1" }], promptVersion: "2",
} satisfies TraceVersion;

describe("diffVersions", () => {
  it("names a control change and an instruction change", () => {
    const prev = base;
    const curr = { ...base, controls: { lens: "wide-24" }, instruction: "wide" };
    const d = diffVersions(prev, curr);
    expect(d.reroll).toBe(false);
    expect(d.changes.map((c) => c.field).sort()).toEqual(["controls", "instruction"]);
    const lens = d.changes.find((c) => c.field === "controls")!;
    expect(lens.from).toContain("auto"); expect(lens.to).toContain("wide-24");
  });

  it("detects a reference (upstream versionId) change", () => {
    const curr = { ...base, upstream: [{ nodeId: "s", versionId: "sv2" }] };
    expect(diffVersions(base, curr).changes.map((c) => c.field)).toEqual(["reference"]);
  });

  it("flags a re-roll when nothing structured changed", () => {
    const d = diffVersions(base, { ...base, versionId: "y" });
    expect(d.reroll).toBe(true);
    expect(d.changes).toEqual([]);
  });
});
