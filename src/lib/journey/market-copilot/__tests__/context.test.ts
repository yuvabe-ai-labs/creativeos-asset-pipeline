import { describe, expect, it } from "vitest";
import { fallbackSuggestions, liveStatus, type KbContext } from "@/lib/journey/kb-copilot/context";
import { kbWaiting } from "@/lib/journey/kb-copilot/waiting";
import type { BrandsCard, SignalDraftCard, ThreadMessage } from "@/lib/journey/thread/schema";
import { pendingBrands, RESEARCH_CHOICE, type MarketContext } from "../context";

// D530: what the onboarding copilot says and waits on once the brand KB is ready.

const market = (over: Partial<MarketContext> = {}): MarketContext => ({
  open: true, status: "pending", counts: { direct: 0, adjacent: 0, signals: 0 }, signalNames: [],
  pendingBrands: null, job: null, ownHandle: null, ...over,
});
const ready = (m: MarketContext): KbContext => ({
  clientName: "Acme", clientSlug: "acme", unreviewed: null, kbStatus: "ready", hasVersion: true, websiteUrl: null, instagram: null, facebook: null,
  documentCount: 1, imageCount: 0, job: null, importing: [], studyingImages: false, importedBefore: [], market: m,
});
const brands: BrandsCard = { kind: "brands", status: "pending", focus: null, jobId: null, brands: [] };
const draft: SignalDraftCard = { kind: "signal-draft", status: "pending", name: "n", tags: [], description: "d", itemIds: [], thumbs: [], signalId: null };
const msg = (id: string, card: ThreadMessage["card"]): ThreadMessage =>
  ({ id, role: "assistant", content: "", card, attachments: [], suggestions: [], createdAt: "" });

describe("pendingBrands", () => {
  it("is the newest brands card still waiting, by message id", () => {
    const messages = [msg("a", { ...brands, status: "fetched" }), msg("b", brands), msg("c", null)];
    expect(pendingBrands(messages)).toEqual({ messageId: "b", card: brands });
  });
  it("is null when none is waiting", () => {
    expect(pendingBrands([msg("a", { ...brands, status: "stale" })])).toBeNull();
  });
});

describe("waiting once the KB is ready", () => {
  it("is the market gate while market research is pending", () => {
    expect(kbWaiting(ready(market()), [])).toEqual({
      kind: "gate", label: "Approve market research", title: "Approve market research",
      opens: "Approve market research when it reflects the market. That opens scripts.",
      why: "Only a person can approve it. I never do.", action: "approve-market",
    });
  });

  it("is a task while a brands card waits", () => {
    expect(kbWaiting(ready(market()), [msg("b", brands)])).toMatchObject({ kind: "task", label: "Review the brands" });
  });

  it("is a task while signal drafts wait, counted", () => {
    expect(kbWaiting(ready(market()), [msg("d1", draft), msg("d2", draft), msg("d3", { ...draft, status: "kept" })])).toMatchObject({
      kind: "task", label: "Review 2 signals",
      links: [{ label: "Market research", href: "/clients/acme/market" }],
    });
  });

  it("waits on nobody once market research is approved", () => {
    expect(kbWaiting(ready(market({ status: "approved" })), [])).toBeNull();
  });
});

describe("the offer and the live line", () => {
  it("offers to research the market when both tabs are empty", () => {
    expect(fallbackSuggestions(ready(market()))).toEqual([RESEARCH_CHOICE]);
    expect(RESEARCH_CHOICE).toBe("Research the market");
  });

  it("does not offer it once there are references, or while a list waits", () => {
    expect(fallbackSuggestions(ready(market({ counts: { direct: 3, adjacent: 0, signals: 0 } })))).toEqual([]);
    expect(fallbackSuggestions(ready(market({ pendingBrands: { messageId: "b", card: brands } })))).toEqual([]);
  });

  it("shows a running market job's line", () => {
    const line = "Bringing in posts from 4 brands…";
    expect(liveStatus(ready(market({ job: { kind: "market-fetch", status: "running", phaseMessage: line } })))).toEqual([{ text: line, state: "running" }]);
    expect(liveStatus(ready(market({ job: { kind: "market-fetch", status: "succeeded", phaseMessage: line } })))).toEqual([]);
  });
});
