import { describe, it, expect } from "vitest";
import { firstSnapshotNotice } from "./first-snapshot-notice";

describe("firstSnapshotNotice", () => {
  it("is silent on success — the data is the notice", () => {
    expect(firstSnapshotNotice("acme", "ok")).toBeNull();
  });

  it("names the likely causes when Instagram returned nothing", () => {
    expect(firstSnapshotNotice("acme", "no-data")).toBe(
      "Instagram returned no data for @acme — private or misspelled? Use Refresh to try again.",
    );
  });

  it("says the handle IS tracked when the fetch failed", () => {
    expect(firstSnapshotNotice("acme", "error")).toBe(
      "Tracked @acme, but the first snapshot failed. Use Refresh to try again.",
    );
  });
});
