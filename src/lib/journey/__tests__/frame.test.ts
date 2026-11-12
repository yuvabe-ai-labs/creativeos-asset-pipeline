import { describe, expect, it } from "vitest";
import { frameFor } from "../frame";

const f = (path: string) => frameFor(path, "chupps");

describe("frameFor", () => {
  it("client home: tabs, none active, no panel", () => {
    expect(f("/clients/chupps")).toEqual({ tabs: true, tab: null, panel: null });
  });
  it("stage pages get their tab and the panel", () => {
    expect(f("/clients/chupps/kb")).toEqual({ tabs: true, tab: "kb", panel: "kb" });
    expect(f("/clients/chupps/market")).toEqual({ tabs: true, tab: "market", panel: "market" });
    expect(f("/clients/chupps/scripts")).toEqual({ tabs: true, tab: "scripts", panel: "scripts" });
  });
  it("a script keeps its own copilot, so no panel", () => {
    expect(f("/clients/chupps/scripts/abc")).toEqual({ tabs: true, tab: "scripts", panel: null });
  });
  it("avatars and brand assets are tabs without a panel", () => {
    expect(f("/clients/chupps/avatars/new")).toEqual({ tabs: true, tab: "avatars", panel: null });
    expect(f("/clients/chupps/brand-assets")).toEqual({ tabs: true, tab: "brand-assets", panel: null });
  });
  it("the canvas editor gets no frame", () => {
    expect(f("/clients/chupps/canvases/c1")).toEqual({ tabs: false, tab: null, panel: null });
    expect(f("/clients/chupps/canvases/c1/edit")).toEqual({ tabs: false, tab: null, panel: null });
  });
  it("ignores a trailing slash and a query string", () => {
    expect(f("/clients/chupps/kb/?x=1").tab).toBe("kb");
  });
});
