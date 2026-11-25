import { describe, expect, it } from "vitest";
import { fieldsWrittenSince, kbFieldPath, kbTarget, marketSignalId, marketTarget } from "../targets";

describe("market targets (D530)", () => {
  it("names a signal on the Market page, and reads its id back", () => {
    expect(marketTarget.signal("x")).toBe("market-signal:x");
    expect(marketSignalId(marketTarget.signal("x"))).toBe("x");
    expect(marketSignalId("kb:a.b")).toBeNull();
  });
});

describe("brand KB targets", () => {
  it("builds and reads back target ids", () => {
    expect(kbTarget.field("a.b")).toBe("kb:a.b");
    expect(kbTarget.form("website")).toBe("kb-form:website");
    expect(kbTarget.source("d1")).toBe("kb-source:d1");
    expect(kbFieldPath(kbTarget.field("a.b"))).toBe("a.b");
    expect(kbFieldPath("kb-form:website")).toBeNull();
    expect(kbFieldPath("kb-source:d1")).toBeNull();
  });
});

describe("fieldsWrittenSince", () => {
  const written = [
    { target: "kb:a.b", n: 3 }, { target: "kb-form:website", n: 4 }, { target: "kb:c.d", n: 6 },
  ];
  it("gives the review paths written after a count, and the newest count", () => {
    expect(fieldsWrittenSince(written, 3)).toEqual({ paths: new Set(["c.d"]), latest: 6 });
    expect(fieldsWrittenSince(written, 0)).toEqual({ paths: new Set(["a.b", "c.d"]), latest: 6 });
  });
  it("gives nothing, and the same count, when nothing is newer", () => {
    expect(fieldsWrittenSince(written, 6)).toEqual({ paths: new Set(), latest: 6 });
  });
});
