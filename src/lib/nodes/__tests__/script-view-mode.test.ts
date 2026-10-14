import { describe, it, expect } from "vitest";
import { scriptViewMode } from "../script-view-mode";

describe("scriptViewMode", () => {
  it("shows the skeleton whenever the script is parsing, even with nothing parsed yet (never the upload screen)", () => {
    expect(scriptViewMode({ parsing: true, hasParsed: false, replacing: false })).toBe("skeleton");
    expect(scriptViewMode({ parsing: true, hasParsed: true, replacing: false })).toBe("skeleton");
  });
  it("shows the parsed document once parsing ends (Review Focus 4)", () => {
    expect(scriptViewMode({ parsing: false, hasParsed: true, replacing: false })).toBe("parsed");
  });
  it("shows the upload screen when nothing is parsed or the person is replacing it", () => {
    expect(scriptViewMode({ parsing: false, hasParsed: false, replacing: false })).toBe("empty");
    expect(scriptViewMode({ parsing: false, hasParsed: true, replacing: true })).toBe("empty");
  });
});
