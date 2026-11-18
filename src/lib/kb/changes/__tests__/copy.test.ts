import { describe, expect, it } from "vitest";
import { approveLabel, settledLine, valueText } from "../copy";
import type { ChangeCard } from "@/lib/journey/thread/schema";

const card = (over: Partial<ChangeCard>): ChangeCard => ({
  kind: "change", versionId: "v1", status: "pending", decision: null,
  fields: [
    { path: "a.b", label: "A", before: "x", after: "y", from: "You, in this chat", docId: null },
    { path: "a.c", label: "C", before: "x", after: "y", from: "You, in this chat", docId: null },
    { path: "a.d", label: "D", before: "x", after: "y", from: "You, in this chat", docId: null },
  ],
  ...over,
});
const decision = (kept: string[], outOfDate: string[] = []) => ({ by: "Cyril", byId: null, at: "", kept, outOfDate });

describe("approveLabel", () => {
  it("counts the changes the button will apply", () => {
    expect(approveLabel(1)).toBe("Approve 1 change");
    expect(approveLabel(3)).toBe("Approve 3 changes");
    expect(approveLabel(0)).toBe("Approve");
  });
});

describe("valueText", () => {
  it("shows a list as comma-separated items and nothing as 'none'", () => {
    expect(valueText(["cheap", "chemical-free"])).toBe("cheap, chemical-free");
    expect(valueText(null)).toBe("none");
    expect(valueText([])).toBe("none");
    expect(valueText(" Warm ")).toBe("Warm");
  });
});

describe("settledLine", () => {
  it("says who approved and how many of the fields changed", () => {
    expect(settledLine(card({ status: "applied", decision: decision(["a.b", "a.c"]) }))).toBe("Approved by Cyril: 2 of 3 changed.");
  });
  it("says who discarded it", () => {
    expect(settledLine(card({ status: "discarded", decision: decision([]) }))).toBe("Discarded by Cyril.");
  });
  it("says nothing changed when every kept field was changed by hand since", () => {
    expect(settledLine(card({ status: "applied", decision: decision([], ["a.b"]) }))).toBe("Approved by Cyril: nothing changed. The fields were changed by hand since.");
  });
  it("says a stale card no longer applies", () => {
    expect(settledLine(card({ status: "stale", decision: decision([]) }))).toBe("The brand KB was rebuilt after this was proposed, so it no longer applies.");
  });
  it("says nothing for a pending card", () => {
    expect(settledLine(card({}))).toBeNull();
  });
});
