import { describe, it, expect } from "vitest";
import { parseScriptDragPayload } from "../canvas";

describe("parseScriptDragPayload", () => {
  it("reads a script id", () => {
    expect(parseScriptDragPayload(JSON.stringify({ scriptId: "s1" }))).toEqual({ scriptId: "s1" });
  });
  it("rejects anything else", () => {
    expect(parseScriptDragPayload("")).toBeNull();
    expect(parseScriptDragPayload("not json")).toBeNull();
    expect(parseScriptDragPayload(JSON.stringify({ scriptId: "" }))).toBeNull();
    expect(parseScriptDragPayload(JSON.stringify({ avatarId: "a1" }))).toBeNull();
  });
});
