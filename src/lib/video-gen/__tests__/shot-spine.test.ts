import { describe, it, expect } from "vitest";
import { describeShotSpine } from "../shot-spine";

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

  // D83: the opinion is expressed by layout. A missing end frame is an inviting empty slot,
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
