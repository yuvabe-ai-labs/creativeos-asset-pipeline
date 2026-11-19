import { describe, expect, it } from "vitest";
import { kbFieldPath, kbTarget } from "../targets";

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
