// src/lib/script-review/__tests__/paths.test.ts
import { describe, it, expect } from "vitest";
import { toCanonicalShareToken } from "@/lib/client-review/token";
import { sharePathFor } from "@/lib/client-review/paths";
import { scriptSharePathFor } from "../paths";

describe("scriptSharePathFor", () => {
  it("is D311's titled link, one segment under /r/s/", () => {
    expect(scriptSharePathFor("6f1c", "Golu starts today")).toBe("/r/s/golu-starts-today-6f1c");
  });

  it("falls back to 'script' for a title with no latin letters", () => {
    expect(scriptSharePathFor("6f1c", "கொலு")).toBe("/r/s/script-6f1c");
  });

  it("parses back to the code, so a renamed script never breaks a link", () => {
    expect(toCanonicalShareToken("golu-starts-today-6f1c")).toBe("6f1c");
    expect(toCanonicalShareToken("a-new-title-6f1c")).toBe("6f1c");
  });

  it("leaves the video review links exactly as they were", () => {
    expect(sharePathFor("b4b4", "")).toBe("/r/cut-b4b4");
  });
});
