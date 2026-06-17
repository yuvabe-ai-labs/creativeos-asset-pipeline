import { describe, it, expect } from "vitest";
import { parseArchivedBody } from "./parse-archived-body";

describe("parseArchivedBody", () => {
  it("returns the boolean when body is { archived: boolean }", () => {
    expect(parseArchivedBody({ archived: true })).toBe(true);
    expect(parseArchivedBody({ archived: false })).toBe(false);
  });

  it("returns null for a missing or non-boolean archived field", () => {
    expect(parseArchivedBody({})).toBeNull();
    expect(parseArchivedBody({ archived: "yes" })).toBeNull();
    expect(parseArchivedBody({ archived: 1 })).toBeNull();
  });

  it("returns null for non-object bodies", () => {
    expect(parseArchivedBody(null)).toBeNull();
    expect(parseArchivedBody(undefined)).toBeNull();
    expect(parseArchivedBody("true")).toBeNull();
  });
});
