import { describe, expect, it } from "vitest";
import { frameFor } from "../frame";

const f = (path: string) => frameFor(path, "chupps");

describe("frameFor", () => {
  it("client home: tabs, none active, the panel of whichever stage the client is at", () => {
    expect(f("/clients/chupps")).toEqual({ tabs: true, tab: null, panel: "current" });
  });
  it("stage pages get their tab and the panel", () => {
    expect(f("/clients/chupps/kb")).toEqual({ tabs: true, tab: "kb", panel: "kb" });
    expect(f("/clients/chupps/market")).toEqual({ tabs: true, tab: "market", panel: "market" });
    expect(f("/clients/chupps/scripts")).toEqual({ tabs: true, tab: "scripts", panel: "scripts" });
  });
  it("inside a script there is no frame: the script is its own thread, with its own copilot and trail", () => {
    expect(f("/clients/chupps/scripts/abc")).toEqual({ tabs: false, tab: null, panel: null });
    expect(f("/clients/chupps/scripts/abc/review")).toEqual({ tabs: false, tab: null, panel: null });
  });
  it("avatars and brand assets keep the panel, showing the stage the client is at", () => {
    expect(f("/clients/chupps/avatars")).toEqual({ tabs: true, tab: "avatars", panel: "current" });
    expect(f("/clients/chupps/brand-assets")).toEqual({ tabs: true, tab: "brand-assets", panel: "current" });
  });
  it("a page inside avatars has the whole width, so no panel", () => {
    expect(f("/clients/chupps/avatars/new")).toEqual({ tabs: true, tab: "avatars", panel: null });
  });
  it("the canvas editor gets no frame", () => {
    expect(f("/clients/chupps/canvases/c1")).toEqual({ tabs: false, tab: null, panel: null });
    expect(f("/clients/chupps/canvases/c1/edit")).toEqual({ tabs: false, tab: null, panel: null });
  });
  it("ignores a trailing slash and a query string", () => {
    expect(f("/clients/chupps/kb/?x=1").tab).toBe("kb");
  });
});
