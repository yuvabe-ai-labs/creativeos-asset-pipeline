import { describe, expect, it } from "vitest";
import { guideFor } from "../guide";
import type { JourneyState } from "../stages";

const fresh: JourneyState = { kb: "in_progress", market: "locked", scripts: "locked" };
const kbDone: JourneyState = { kb: "approved", market: "in_progress", scripts: "locked" };
const allDone: JourneyState = { kb: "approved", market: "approved", scripts: "open" };
const slug = "chupps";

const KB_GATE = {
  title: "Next stop: brand KB approval",
  body: "Review each part of the brand KB and mark it ready. Market research opens after that. I can't approve it for you.",
};

describe("guideFor: brand KB", () => {
  it("nothing built yet", () => {
    expect(guideFor({ section: "kb", state: fresh, kbStatus: "pending", slug })).toEqual({
      done: [], waiting: "Add the brand's website or documents to build the brand KB", gate: KB_GATE, next: null,
    });
  });
  it("in review", () => {
    expect(guideFor({ section: "kb", state: fresh, kbStatus: "in_review", slug })).toEqual({
      done: [], waiting: "Review the brand KB and mark it ready", gate: KB_GATE, next: null,
    });
  });
  it("approved, market research next", () => {
    expect(guideFor({ section: "kb", state: kbDone, kbStatus: "ready", slug })).toEqual({
      done: ["Brand KB approved"], waiting: null, gate: null,
      next: { label: "Go to market research", href: "/clients/chupps/market" },
    });
  });
  it("approved with research approved points at scripts", () => {
    expect(guideFor({ section: "kb", state: allDone, kbStatus: "ready", slug }).next)
      .toEqual({ label: "Go to scripts", href: "/clients/chupps/scripts" });
  });
});

describe("guideFor: market research", () => {
  it("locked", () => {
    expect(guideFor({ section: "market", state: fresh, kbStatus: "in_review", slug })).toEqual({
      done: [], waiting: "Approve the brand KB first",
      gate: { title: "Market research is locked", body: "It opens once the brand KB is approved." },
      next: { label: "Go to brand KB", href: "/clients/chupps/kb" },
    });
  });
  it("in progress", () => {
    expect(guideFor({ section: "market", state: kbDone, kbStatus: "ready", slug })).toEqual({
      done: ["Brand KB approved"], waiting: "Collect references, then approve market research",
      gate: {
        title: "Next stop: market research approval",
        body: "Approve the research when it reflects the market. Scripts open after that. I can't approve it for you.",
      },
      next: null,
    });
  });
  it("approved", () => {
    expect(guideFor({ section: "market", state: allDone, kbStatus: "ready", slug })).toEqual({
      done: ["Brand KB approved", "Market research approved"], waiting: null, gate: null,
      next: { label: "Go to scripts", href: "/clients/chupps/scripts" },
    });
  });
});

describe("guideFor: scripts", () => {
  it("locked", () => {
    expect(guideFor({ section: "scripts", state: kbDone, kbStatus: "ready", slug })).toEqual({
      done: ["Brand KB approved"], waiting: "Approve market research to write a new script",
      gate: {
        title: "Scripts are locked",
        body: "New scripts open once market research is approved. You can still paste a script you already have.",
      },
      next: { label: "Go to market research", href: "/clients/chupps/market" },
    });
  });
  it("open", () => {
    expect(guideFor({ section: "scripts", state: allDone, kbStatus: "ready", slug })).toEqual({
      done: ["Brand KB approved", "Market research approved"], waiting: "Start a new script", gate: null, next: null,
    });
  });
  it("lists only what is true", () => {
    const existing: JourneyState = { kb: "in_progress", market: "approved", scripts: "open" };
    expect(guideFor({ section: "scripts", state: existing, kbStatus: "in_review", slug }).done)
      .toEqual(["Market research approved"]);
  });
});
