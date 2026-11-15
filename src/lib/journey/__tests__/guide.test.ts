import { describe, expect, it } from "vitest";
import { guideFor } from "../guide";
import type { JourneyState } from "../stages";

const fresh: JourneyState = { kb: "in_progress", market: "locked", scripts: "locked" };
const kbDone: JourneyState = { kb: "approved", market: "in_progress", scripts: "locked" };
const allDone: JourneyState = { kb: "approved", market: "approved", scripts: "open" };
const slug = "chupps";

describe("guideFor: market research", () => {
  it("locked", () => {
    expect(guideFor({ section: "market", state: fresh, slug })).toEqual({
      done: [], waiting: "Approve the brand KB first",
      gate: { title: "Market research is locked", body: "It opens once the brand KB is approved." },
      next: { label: "Go to brand KB", href: "/clients/chupps/kb" },
    });
  });
  it("in progress", () => {
    expect(guideFor({ section: "market", state: kbDone, slug })).toEqual({
      done: ["Brand KB approved"], waiting: "Collect references, then approve market research",
      gate: {
        title: "Next stop: market research approval",
        body: "Approve the research when it reflects the market. Scripts open after that. I can't approve it for you.",
      },
      next: null,
    });
  });
  it("approved", () => {
    expect(guideFor({ section: "market", state: allDone, slug })).toEqual({
      done: ["Brand KB approved", "Market research approved"], waiting: null, gate: null,
      next: { label: "Go to scripts", href: "/clients/chupps/scripts" },
    });
  });
});

describe("guideFor: scripts", () => {
  it("locked", () => {
    expect(guideFor({ section: "scripts", state: kbDone, slug })).toEqual({
      done: ["Brand KB approved"], waiting: "Approve market research to write a new script",
      gate: {
        title: "Scripts are locked",
        body: "New scripts open once market research is approved. You can still paste a script you already have.",
      },
      next: { label: "Go to market research", href: "/clients/chupps/market" },
    });
  });
  it("open", () => {
    expect(guideFor({ section: "scripts", state: allDone, slug })).toEqual({
      done: ["Brand KB approved", "Market research approved"], waiting: "Start a new script", gate: null, next: null,
    });
  });
  it("lists only what is true", () => {
    const existing: JourneyState = { kb: "in_progress", market: "approved", scripts: "open" };
    expect(guideFor({ section: "scripts", state: existing, slug }).done)
      .toEqual(["Market research approved"]);
  });
});
