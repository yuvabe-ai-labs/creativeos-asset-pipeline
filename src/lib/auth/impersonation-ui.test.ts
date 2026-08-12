import { describe, it, expect } from "vitest";
import { bannerPresentation, headerTopClass } from "./impersonation-ui";

describe("bannerPresentation", () => {
  it("reads as read-only, and offers Enable editing, when not elevated", () => {
    const p = bannerPresentation(false);
    expect(p.eyebrow).toBe("Viewing as");
    expect(p.stateLabel).toBe("Read-only");
    expect(p.showEnableEditing).toBe(true);
  });

  it("reads as live editing, and hides Enable editing, when elevated", () => {
    const p = bannerPresentation(true);
    expect(p.eyebrow).toBe("Editing as");
    expect(p.stateLabel).toBe("Editing");
    expect(p.showEnableEditing).toBe(false);
  });

  it("gives the two states visually distinct treatments", () => {
    expect(bannerPresentation(true).barClass).not.toBe(
      bannerPresentation(false).barClass,
    );
    expect(bannerPresentation(true).ruleClass).not.toBe(
      bannerPresentation(false).ruleClass,
    );
  });

  it("never leaks the internal term to an operator-facing string", () => {
    for (const p of [bannerPresentation(true), bannerPresentation(false)]) {
      expect(`${p.eyebrow} ${p.stateLabel}`.toLowerCase()).not.toContain("elevated");
    }
  });
});

describe("headerTopClass", () => {
  // The regression this guards: the banner was not sticky while the header below it
  // was, so scrolling erased every trace of impersonation.
  it("sits flush at the top when not impersonating", () => {
    expect(headerTopClass(false)).toBe("top-0");
  });

  it("drops below the banner while impersonating", () => {
    expect(headerTopClass(true)).toBe("top-11");
  });
});
