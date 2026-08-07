import { describe, it, expect } from "vitest";
import { renderState, RENDER_STATE_LABELS } from "./render-state";

const EARLIER = "2026-08-05T10:00:00.000Z";
const LATER = "2026-08-05T11:00:00.000Z";

describe("renderState", () => {
  it("is draft when nothing has ever been exported", () => {
    expect(renderState({})).toBe("draft");
    expect(renderState({ layersUpdatedAt: LATER })).toBe("draft");
  });

  it("is exported when the render is at least as new as the last layer edit", () => {
    expect(renderState({ fileUrl: "u", renderedAt: LATER, layersUpdatedAt: EARLIER })).toBe("exported");
  });

  it("is stale when layers changed after the last export", () => {
    expect(renderState({ fileUrl: "u", renderedAt: EARLIER, layersUpdatedAt: LATER })).toBe("stale");
  });

  it("treats a missing layersUpdatedAt as current, not stale", () => {
    // Every node saved before layersUpdatedAt existed lacks it. Guessing 'stale' would
    // flag every previously-exported post as dirty on first load (D126).
    expect(renderState({ fileUrl: "u", renderedAt: EARLIER })).toBe("exported");
  });

  it("treats a missing renderedAt with a fileUrl as exported", () => {
    // Older exports wrote fileUrl before renderedAt was added.
    expect(renderState({ fileUrl: "u", layersUpdatedAt: LATER })).toBe("exported");
  });

  it("is exported when the two stamps are identical", () => {
    expect(renderState({ fileUrl: "u", renderedAt: LATER, layersUpdatedAt: LATER })).toBe("exported");
  });

  it("ignores unparseable timestamps rather than throwing", () => {
    expect(renderState({ fileUrl: "u", renderedAt: "nonsense", layersUpdatedAt: LATER })).toBe("exported");
  });
});

describe("RENDER_STATE_LABELS", () => {
  it("labels every state in plain language", () => {
    expect(RENDER_STATE_LABELS.draft).toBe("Draft");
    expect(RENDER_STATE_LABELS.exported).toBe("Exported");
    expect(RENDER_STATE_LABELS.stale).toBe("Edited since export");
  });
});
