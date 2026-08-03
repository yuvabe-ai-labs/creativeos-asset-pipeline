import { describe, it, expect } from "vitest";
import { describeShotSpine, describeDurationLabel } from "../shot-spine";
import type { ParamSpec } from "@/lib/image-gen/types";

const durationSelect = {
  name: "duration",
  label: "Duration (s)",
  component: "select",
  group: "primary",
  order: 1,
  visible: true,
  defaultValue: "8",
  constraints: { type: "select", options: ["4", "6", "8"] },
} as ParamSpec;

const durationSlider = {
  ...durationSelect,
  component: "slider",
  constraints: { type: "slider", min: 3, max: 15 },
} as ParamSpec;

// The spine used to advertise the model's whole menu while a rule had already pinned the value,
// so the card said "4 or 6 or 8s" with 4 and 6 greyed out in the control directly below it.
describe("describeDurationLabel", () => {
  it("reports the model's options when nothing is locked", () => {
    expect(describeDurationLabel(durationSelect)).toBe("4 or 6 or 8s");
  });

  it("reports only the locked value when a rule has pinned duration", () => {
    expect(describeDurationLabel(durationSelect, "8")).toBe("8s");
  });

  it("renders a slider spec as a range", () => {
    expect(describeDurationLabel(durationSlider)).toBe("3–15s");
  });

  it("still prefers the locked value over a slider range", () => {
    expect(describeDurationLabel(durationSlider, 10)).toBe("10s");
  });

  it("falls back to a dash when the model exposes no duration param", () => {
    expect(describeDurationLabel(undefined)).toBe("—");
  });
});

const kling30 = { startFrame: true, endFrame: true, maxReferenceImages: 0 };
const klingO1 = { startFrame: true, endFrame: true, maxReferenceImages: 5 };

function slot(
  model: ReturnType<typeof describeShotSpine>,
  role: "start_frame" | "end_frame" | "reference",
) {
  const found = model.slots.find((s) => s.role === role);
  if (!found) throw new Error(`missing slot: ${role}`);
  return found;
}

describe("describeShotSpine", () => {
  it("marks an unfilled end slot as empty when the model supports it", () => {
    const model = describeShotSpine({
      imageInputs: kling30,
      hasStartFrame: true,
      hasEndFrame: false,
      referenceCount: 0,
      durationLabel: "3-15s",
    });
    expect(slot(model, "end_frame").state).toBe("empty");
  });

  it("marks a filled end slot as filled", () => {
    const model = describeShotSpine({
      imageInputs: kling30,
      hasStartFrame: true,
      hasEndFrame: true,
      referenceCount: 0,
      durationLabel: "3-15s",
    });
    expect(slot(model, "end_frame").state).toBe("filled");
  });

  // Absence should be legible, not hidden — an unsupported slot still renders, inert.
  it("marks the reference slot unsupported when the model has no reference capability", () => {
    const model = describeShotSpine({
      imageInputs: kling30,
      hasStartFrame: true,
      hasEndFrame: false,
      referenceCount: 0,
      durationLabel: "3-15s",
    });
    expect(slot(model, "reference").state).toBe("unsupported");
  });

  it("reports reference count against the cap when supported", () => {
    const model = describeShotSpine({
      imageInputs: klingO1,
      hasStartFrame: true,
      hasEndFrame: true,
      referenceCount: 2,
      durationLabel: "5 or 10s",
    });
    expect(slot(model, "reference").state).toBe("filled");
    expect(slot(model, "reference").detail).toBe("2 of 5");
  });

  it("shows no detail on an empty reference slot", () => {
    const model = describeShotSpine({
      imageInputs: klingO1,
      hasStartFrame: true,
      hasEndFrame: false,
      referenceCount: 0,
      durationLabel: "5 or 10s",
    });
    expect(slot(model, "reference").state).toBe("empty");
    expect(slot(model, "reference").detail).toBeUndefined();
  });

  it("orders the slots start, end, reference — the narrative order of a shot", () => {
    const model = describeShotSpine({
      imageInputs: klingO1,
      hasStartFrame: true,
      hasEndFrame: false,
      referenceCount: 0,
      durationLabel: "5 or 10s",
    });
    expect(model.slots.map((s) => s.role)).toEqual([
      "start_frame",
      "end_frame",
      "reference",
    ]);
  });

  it("surfaces the duration label verbatim", () => {
    const model = describeShotSpine({
      imageInputs: klingO1,
      hasStartFrame: true,
      hasEndFrame: false,
      referenceCount: 0,
      durationLabel: "5 or 10s",
    });
    expect(model.durationLabel).toBe("5 or 10s");
  });

  // D95: the opinion is expressed by layout. A missing end frame is an inviting empty slot,
  // never an error and never a gate.
  it("never reports a blocking state", () => {
    const model = describeShotSpine({
      imageInputs: klingO1,
      hasStartFrame: false,
      hasEndFrame: false,
      referenceCount: 0,
      durationLabel: "5 or 10s",
    });
    expect(model.slots.every((s) => ["filled", "empty", "unsupported"].includes(s.state))).toBe(
      true,
    );
  });
});
