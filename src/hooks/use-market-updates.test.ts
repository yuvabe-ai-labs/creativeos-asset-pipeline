import { describe, it, expect } from "vitest";
import { isBoardEvent } from "./use-market-updates";

const BOARDS = ["direct-1", "adjacent-1"];

describe("isBoardEvent", () => {
  it("accepts an event on either of this client's boards", () => {
    expect(isBoardEvent(BOARDS, "direct-1")).toBe(true);
    expect(isBoardEvent(BOARDS, "adjacent-1")).toBe(true);
  });

  // The channel is org-wide: another client's board changing must not refetch this page.
  it("ignores an event on a foreign board", () => {
    expect(isBoardEvent(BOARDS, "someone-elses-board")).toBe(false);
  });

  // A DELETE without REPLICA IDENTITY FULL carries no id. A redundant refetch is cheap;
  // a missed one leaves a removed tile on the shelf.
  it("treats an unidentifiable event as possibly mine", () => {
    expect(isBoardEvent(BOARDS, null)).toBe(true);
  });
});
