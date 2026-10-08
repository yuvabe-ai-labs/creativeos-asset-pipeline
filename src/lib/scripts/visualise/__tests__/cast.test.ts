import { describe, it, expect } from "vitest";
import { archiveRefusal, isVisualiseStage } from "../cast";

describe("isVisualiseStage", () => {
  it("allows Visualise work in Visualise and In review, nowhere else", () => {
    expect(isVisualiseStage("visualise")).toBe(true);
    expect(isVisualiseStage("in_review")).toBe(true);
    expect(isVisualiseStage("generate")).toBe(false);
    expect(isVisualiseStage("approved")).toBe(false);
  });
});

describe("archiveRefusal (D346)", () => {
  it("says nothing for an avatar no script uses", () => {
    expect(archiveRefusal([])).toBeNull();
  });

  it("names the one script that uses it", () => {
    expect(archiveRefusal(["Reel 01 · Golu starts today"])).toBe(
      "This avatar is in Reel 01 · Golu starts today, so it can't be archived. Change it in that script first.",
    );
  });

  it("names every script when several use it", () => {
    expect(archiveRefusal(["Reel 01 · Golu starts today", "Reel 16 · Harvest week"])).toBe(
      "This avatar is in 2 scripts (Reel 01 · Golu starts today, Reel 16 · Harvest week), so it can't be archived. Change it in those scripts first.",
    );
  });
});
