import { describe, it, expect, vi } from "vitest";
import { onAccessDenied, reportStatus } from "./access-signal";

describe("access-signal", () => {
  it("tells listeners about a 403 and nothing else", () => {
    const listener = vi.fn();
    const off = onAccessDenied(listener);
    reportStatus(200);
    reportStatus(404);
    reportStatus(403);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    reportStatus(403);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
