import { describe, it, expect, vi, afterEach } from "vitest";
import { readCopilotCollapsed, writeCopilotCollapsed } from "./use-copilot-collapsed";

afterEach(() => vi.unstubAllGlobals());

function fakeStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

describe("the copilot's collapsed state", () => {
  it("is remembered per script, and a script never collapsed starts open", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    expect(readCopilotCollapsed("s1")).toBe(false);
    writeCopilotCollapsed("s1", true);
    expect(readCopilotCollapsed("s1")).toBe(true);
    expect(readCopilotCollapsed("s2")).toBe(false);
  });

  it("still toggles for this visit when storage is blocked (a private window)", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    writeCopilotCollapsed("s3", true);
    expect(readCopilotCollapsed("s3")).toBe(true);
  });
});
