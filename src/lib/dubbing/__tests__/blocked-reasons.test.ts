import { describe, it, expect } from "vitest";
import { dubBlockedReason, lipSyncBlockedReason, LIP_SYNC_NEEDS_DUB } from "../blocked-reasons";
import { DUB_NO_LENGTH_MESSAGE } from "../copy";

const dubOk = { editable: true, running: null, hasSource: true, sourceLoading: false, sourceSeconds: 8 } as const;
const lipOk = { editable: true, running: null, hasDub: true, dubSeconds: 8 } as const;

describe("why a Dubbing control is off", () => {
  it("says nothing when Dub can run, or while the take's length is still loading", () => {
    expect(dubBlockedReason(dubOk)).toBeNull();
    expect(dubBlockedReason({ ...dubOk, sourceLoading: true, sourceSeconds: 0 })).toBeNull();
  });

  it("explains each reason Dub is off, read-only first", () => {
    expect(dubBlockedReason({ ...dubOk, editable: false, hasSource: false })).toBe("You can view this canvas but not change it.");
    expect(dubBlockedReason({ ...dubOk, running: "dub" })).toBe("A dub is already running.");
    expect(dubBlockedReason({ ...dubOk, running: "lipsync" })).toBe("Wait for lip sync to finish.");
    expect(dubBlockedReason({ ...dubOk, hasSource: false })).toBe("Connect a video to dub first.");
    expect(dubBlockedReason({ ...dubOk, sourceSeconds: 0 })).toBe(DUB_NO_LENGTH_MESSAGE);
  });

  it("explains each reason Lip sync is off", () => {
    expect(lipSyncBlockedReason(lipOk)).toBeNull();
    expect(lipSyncBlockedReason({ ...lipOk, hasDub: false })).toBe(LIP_SYNC_NEEDS_DUB);
    expect(lipSyncBlockedReason({ ...lipOk, running: "dub" })).toBe("Wait for the dub to finish.");
    expect(lipSyncBlockedReason({ ...lipOk, running: "lipsync" })).toBe("Lip sync is already running.");
    expect(lipSyncBlockedReason({ ...lipOk, dubSeconds: 0 })).toMatch(/no recorded length/);
  });
});
