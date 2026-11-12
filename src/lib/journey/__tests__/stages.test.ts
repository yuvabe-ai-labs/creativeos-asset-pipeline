import { describe, expect, it } from "vitest";
import { canApproveMarket, journeyState, scriptsLocked } from "../stages";

describe("journeyState", () => {
  it("new client: KB in progress, the rest locked", () => {
    expect(journeyState({ kb_status: "pending", market_status: "pending" }))
      .toEqual({ kb: "in_progress", market: "locked", scripts: "locked" });
  });
  it("KB in review still locks market research", () => {
    expect(journeyState({ kb_status: "in_review", market_status: "pending" }).market).toBe("locked");
  });
  it("KB ready opens market research and keeps scripts locked", () => {
    expect(journeyState({ kb_status: "ready", market_status: "pending" }))
      .toEqual({ kb: "approved", market: "in_progress", scripts: "locked" });
  });
  it("both approved opens scripts", () => {
    expect(journeyState({ kb_status: "ready", market_status: "approved" }))
      .toEqual({ kb: "approved", market: "approved", scripts: "open" });
  });
  it("existing client with unfinished KB keeps scripts open", () => {
    const c = { kb_status: "in_review", market_status: "approved" } as const;
    expect(journeyState(c)).toEqual({ kb: "in_progress", market: "approved", scripts: "open" });
    expect(scriptsLocked(c)).toBe(false);
  });
});

describe("before the market_status column exists", () => {
  // Code can reach a database before migration 0062 does. A row without the column must read as
  // approved, or every client's scripts would lock.
  const row = { kb_status: "ready" } as unknown as Parameters<typeof journeyState>[0];
  it("reads as approved and unlocked", () => {
    expect(journeyState(row)).toEqual({ kb: "approved", market: "approved", scripts: "open" });
    expect(scriptsLocked(row)).toBe(false);
    expect(canApproveMarket(row)).toBe(false);
  });
});

describe("canApproveMarket", () => {
  it("only with a ready KB and pending research", () => {
    expect(canApproveMarket({ kb_status: "ready", market_status: "pending" })).toBe(true);
    expect(canApproveMarket({ kb_status: "in_review", market_status: "pending" })).toBe(false);
    expect(canApproveMarket({ kb_status: "ready", market_status: "approved" })).toBe(false);
  });
});
