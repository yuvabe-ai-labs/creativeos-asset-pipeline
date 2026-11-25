import { afterEach, describe, expect, it, vi } from "vitest";
import { readStoredFlag, writeStoredFlag } from "./use-stored-flag";

afterEach(() => vi.unstubAllGlobals());

function fakeStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

describe("a flag remembered in this browser", () => {
  it("reads the fallback until it is written, then what was written, per key", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    expect(readStoredFlag("a", false)).toBe(false);
    expect(readStoredFlag("b", true)).toBe(true);
    writeStoredFlag("a", true);
    expect(readStoredFlag("a", false)).toBe(true);
    expect(storage.map.get("a")).toBe("1");
    writeStoredFlag("b", false);
    expect(readStoredFlag("b", true)).toBe(false);
  });

  it("still works for this visit when storage is blocked (a private window)", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    writeStoredFlag("c", true);
    expect(readStoredFlag("c", false)).toBe(true);
  });
});
