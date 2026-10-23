import { describe, expect, it } from "vitest";
import { parseSrt, toSrt } from "../srt";

describe("SRT", () => {
  it("writes cues", () => {
    expect(toSrt([{ start: 1, end: 2.5, text: "Hi" }])).toBe("1\n00:00:01,000 --> 00:00:02,500\nHi\n");
  });

  it("parses CRLF, BOM and short fractions", () => {
    expect(parseSrt("﻿1\r\n00:00:01,5 --> 00:00:02,000\r\nHi\r\nthere\r\n")).toEqual([
      { start: 1.5, end: 2, text: "Hi\nthere" },
    ]);
  });

  it("round-trips several cues and skips junk blocks", () => {
    const cues = [{ start: 0, end: 1.25, text: "One" }, { start: 61.04, end: 3600, text: "Two" }];
    expect(parseSrt(`${toSrt(cues)}\nnot a cue\n`)).toEqual(cues);
  });
});
