import { describe, expect, it, vi } from "vitest";
import type { AgentModel } from "@/lib/journey/agent";
import type { KbContext } from "@/lib/journey/kb-copilot/context";
import { runKbTurn, type KbActions } from "@/lib/journey/kb-copilot/turn";
import type { BrandsCard } from "@/lib/journey/thread/schema";
import type { MarketActions, MarketContext } from "../context";

// D530: the market tools in the onboarding copilot. The rules live in the tools' code; the prompt
// only asks.

type ModelInput = Parameters<AgentModel>[0];
type ModelOutput = Awaited<ReturnType<AgentModel>>;
function scripted(responses: ModelOutput[]) {
  const seen: ModelInput[] = [];
  const model: AgentModel = async (input) => {
    seen.push({ ...input, rounds: [...input.rounds] });
    return responses[Math.min(seen.length - 1, responses.length - 1)];
  };
  return { model, seen };
}
const call = (name: string, args: unknown, id = "c1") => ({ id, name, args });
const say = (text: string): ModelOutput => ({ text, calls: [] });
const outputs = (seen: ModelInput[]) => seen[seen.length - 1].rounds.flatMap((r) => r.results.map((x) => x.output));

const card: BrandsCard = {
  kind: "brands", status: "pending", focus: null, jobId: null,
  brands: [
    { handle: "minimalist", name: "Minimalist", why: "Same buyer.", group: "direct", keep: true },
    { handle: "sleepyowl", name: "Sleepy Owl", why: "Audience.", group: "adjacent", keep: true },
  ],
};
const market = (over: Partial<MarketContext> = {}): MarketContext => ({
  open: true, status: "pending", counts: { direct: 0, adjacent: 0, signals: 0 }, signalNames: [],
  pendingBrands: null, job: null, ownHandle: "acme", ...over,
});
const base: KbContext = {
  clientName: "Acme", clientSlug: "acme", unreviewed: null, kbStatus: "ready", hasVersion: true, websiteUrl: "https://acme.com",
  instagram: "acme", facebook: null, documentCount: 1, imageCount: 0, job: null, importing: [], studyingImages: false, importedBefore: [],
};
const marketActions = (over: Partial<MarketActions> = {}): MarketActions => ({
  findBrands: vi.fn(async () => card.brands), updateBrands: vi.fn(async () => true),
  startFetch: vi.fn(async () => {}), startDraft: vi.fn(async () => {}), ...over,
});
const kbActions = (m: MarketActions): KbActions => ({
  saveWebsite: vi.fn(), saveSocials: vi.fn(), startBuild: vi.fn(), setField: vi.fn(), market: m,
});
const run = (m: MarketContext, a: MarketActions, model: AgentModel) =>
  runKbTurn({ ctx: { ...base, kbStatus: m.open ? "ready" : "in_review", market: m }, history: [], text: "go", attachments: [], actions: kbActions(a), model });

describe("find_brands", () => {
  it("refuses before the brand KB is ready", async () => {
    const a = marketActions();
    const { model, seen } = scripted([{ text: "", calls: [call("find_brands", {})] }, say("Not yet.")]);
    await run(market({ open: false }), a, model);
    expect(a.findBrands).not.toHaveBeenCalled();
    expect(outputs(seen)[0]).toMatch(/brand KB/i);
  });

  it("proposes brands on a new card, and the turn ends on code's words", async () => {
    const a = marketActions();
    const { model, seen } = scripted([{ text: "", calls: [call("find_brands", { focus: "monsoon hooks" })] }, say("never asked")]);
    const result = await run(market(), a, model);
    expect(seen).toHaveLength(1);
    expect(a.findBrands).toHaveBeenCalledWith("monsoon hooks");
    expect(result.card).toEqual({ ...card, focus: "monsoon hooks" });
    expect(result.reply).toMatch(/Nothing is fetched until you confirm/);
  });

  it("says so when the search found no brand it could confirm", async () => {
    const a = marketActions({ findBrands: vi.fn(async () => []) });
    const { model } = scripted([{ text: "", calls: [call("find_brands", {})] }, say("Tell me some.")]);
    const result = await run(market(), a, model);
    expect(result.card).toBeNull();
  });
});

describe("update_brands", () => {
  it("drops and moves a handle on the pending card", async () => {
    const a = marketActions();
    const { model } = scripted([{ text: "", calls: [call("update_brands", { drop: ["@Minimalist"], move: [{ handle: "sleepyowl", group: "direct" }] })] }, say("Done.")]);
    await run(market({ pendingBrands: { messageId: "m1", card } }), a, model);
    expect(a.updateBrands).toHaveBeenCalledWith("m1", {
      ...card,
      brands: [{ ...card.brands[0], keep: false }, { ...card.brands[1], group: "direct" }],
    });
  });

  it("adds a brand the person names", async () => {
    const a = marketActions();
    const { model } = scripted([{ text: "", calls: [call("update_brands", { add: [{ handle: "https://instagram.com/Brandy/", group: "adjacent" }] })] }, say("Added.")]);
    await run(market({ pendingBrands: { messageId: "m1", card } }), a, model);
    const next = vi.mocked(a.updateBrands).mock.calls[0][1];
    expect(next.brands.at(-1)).toEqual({ handle: "brandy", name: "brandy", why: "Added by you.", group: "adjacent", keep: true });
  });

  it("starts a new card for a brand added after the last one was fetched", async () => {
    const a = marketActions();
    const { model } = scripted([{ text: "", calls: [call("update_brands", { add: [{ handle: "brandy", group: "direct" }] })] }, say("Added.")]);
    const result = await run(market(), a, model);
    expect(a.updateBrands).not.toHaveBeenCalled();
    expect(result.card).toEqual({ kind: "brands", status: "pending", focus: null, jobId: null, brands: [{ handle: "brandy", name: "brandy", why: "Added by you.", group: "direct", keep: true }] });
  });

  it("refuses an edit with nothing to add when no list is waiting", async () => {
    const a = marketActions();
    const { model, seen } = scripted([{ text: "", calls: [call("update_brands", { drop: ["x"] })] }, say("No list.")]);
    await run(market(), a, model);
    expect(outputs(seen)[0]).toMatch(/no list of brands/i);
  });
});

describe("fetch_posts", () => {
  it("refuses with no pending brands card", async () => {
    const a = marketActions();
    const { model, seen } = scripted([{ text: "", calls: [call("fetch_posts", {})] }, say("No list.")]);
    await run(market(), a, model);
    expect(a.startFetch).not.toHaveBeenCalled();
    expect(outputs(seen)[0]).toMatch(/no list of brands/i);
  });

  it("refuses while a market job is running", async () => {
    const a = marketActions();
    const { model } = scripted([{ text: "", calls: [call("fetch_posts", {})] }, say("Running.")]);
    await run(market({ pendingBrands: { messageId: "m1", card }, job: { kind: "market-fetch", status: "running", phaseMessage: null } }), a, model);
    expect(a.startFetch).not.toHaveBeenCalled();
  });

  it("refuses when every brand is switched off", async () => {
    const a = marketActions();
    const off = { ...card, brands: card.brands.map((b) => ({ ...b, keep: false })) };
    const { model } = scripted([{ text: "", calls: [call("fetch_posts", {})] }, say("None kept.")]);
    await run(market({ pendingBrands: { messageId: "m1", card: off } }), a, model);
    expect(a.startFetch).not.toHaveBeenCalled();
  });

  it("starts the fetch for the pending card", async () => {
    const a = marketActions();
    const { model } = scripted([{ text: "", calls: [call("fetch_posts", {})] }, say("Fetching.")]);
    await run(market({ pendingBrands: { messageId: "m1", card } }), a, model);
    expect(a.startFetch).toHaveBeenCalledWith("m1", card);
  });
});

describe("draft_signals", () => {
  it("refuses with no references to read", async () => {
    const a = marketActions();
    const { model } = scripted([{ text: "", calls: [call("draft_signals", {})] }, say("Nothing yet.")]);
    await run(market(), a, model);
    expect(a.startDraft).not.toHaveBeenCalled();
  });

  it("refuses while the fetch is still running", async () => {
    const a = marketActions();
    const { model } = scripted([{ text: "", calls: [call("draft_signals", {})] }, say("Wait.")]);
    await run(market({ counts: { direct: 4, adjacent: 0, signals: 0 }, job: { kind: "market-fetch", status: "running", phaseMessage: null } }), a, model);
    expect(a.startDraft).not.toHaveBeenCalled();
  });

  it("starts drafting once there are references", async () => {
    const a = marketActions();
    const { model } = scripted([{ text: "", calls: [call("draft_signals", { focus: "hooks" })] }, say("Drafting.")]);
    await run(market({ counts: { direct: 4, adjacent: 2, signals: 0 } }), a, model);
    expect(a.startDraft).toHaveBeenCalledWith("hooks");
  });
});

describe("the system prompt", () => {
  it("tells the copilot about market research only once the KB is ready", async () => {
    const open = scripted([say("hi")]);
    await run(market(), marketActions(), open.model);
    expect(open.seen[0].system).toMatch(/market research/i);
    expect(open.seen[0].system).toMatch(/never supplies claims/i);
    const closed = scripted([say("hi")]);
    await run(market({ open: false }), marketActions(), closed.model);
    expect(closed.seen[0].system).not.toMatch(/Market research, in steps/);
  });
});
