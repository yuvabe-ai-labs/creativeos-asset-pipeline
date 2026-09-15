import { describe, it, expect } from "vitest";
import { archiveChipState } from "./archive-chip";

const NOW = Date.parse("2026-09-15T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

describe("archiveChipState", () => {
  it("shows active work while a task holds the row", () => {
    expect(archiveChipState("downloading", ago(MIN), NOW)).toEqual({
      label: "Syncing",
      tone: "info",
      active: true,
    });
  });

  // A failure is not "syncing" — it gets the destructive tone so it reads as a
  // problem rather than as progress.
  it("shows a retry after a failure, however old, in the destructive tone", () => {
    const state = archiveChipState("failed", ago(400 * MIN), NOW);
    expect(state?.label).toBe("Retrying");
    expect(state?.tone).toBe("destructive");
  });

  it("says nothing once the media is ours", () => {
    expect(archiveChipState("ready", ago(MIN), NOW)).toBeNull();
  });

  // A link was never going to be archived; a badge explaining its own absence is noise.
  it("says nothing for a deliberately skipped kind", () => {
    expect(archiveChipState("skipped", ago(MIN), NOW)).toBeNull();
  });

  describe("pending depends on recency", () => {
    it("shows Syncing for a clip just made, without the in-flight animation", () => {
      expect(archiveChipState("pending", ago(30_000), NOW)).toEqual({
        label: "Syncing",
        tone: "info",
        active: false,
      });
    });

    // The whole reason this rule exists: migration 0039 defaults every pre-existing
    // row to `pending`, so a blanket chip spinners the entire existing shelf.
    it("says nothing for a backlog row", () => {
      expect(archiveChipState("pending", ago(60 * MIN), NOW)).toBeNull();
      expect(archiveChipState("pending", "2026-09-02T06:24:19Z", NOW)).toBeNull();
    });

    it("stops showing exactly at the freshness boundary", () => {
      expect(archiveChipState("pending", ago(15 * MIN - 1), NOW)).not.toBeNull();
      expect(archiveChipState("pending", ago(15 * MIN + 1), NOW)).toBeNull();
    });

    // An unparseable timestamp yields NaN, and NaN > window is false — which would
    // have made every bad date read as "fresh" and re-light the whole shelf.
    it("treats an unparseable date as backlog, not fresh", () => {
      expect(archiveChipState("pending", "not-a-date", NOW)).toBeNull();
    });
  });
});
