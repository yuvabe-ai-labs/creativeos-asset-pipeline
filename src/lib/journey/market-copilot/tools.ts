import { z } from "zod";
import type { AgentTool } from "@/lib/journey/agent";
import type { BrandsCard, MarketBrand } from "@/lib/journey/thread/schema";
import { normalizeHandle } from "./brands";
import { MARKET_BRANDS_PER_GROUP } from "./constants";
import { marketJobRunning, type MarketActions, type MarketContext } from "./context";

// The market research tools of the onboarding copilot (D530). The rules live here, in code: the
// prompt only asks. Nothing is fetched before a person confirms a list they have seen, and nothing
// here approves market research.

const NOT_OPEN = "Market research opens once the brand KB is approved.";
const NO_LIST = "There is no list of brands waiting. Ask me to research the market first.";
const UNSEEN = "The person has not seen this list yet. Show it and wait for them to say to fetch.";
const NONE_KEPT = "Every brand on the list is switched off. Keep at least one first.";
const RUNNING = "Market research is already running. Wait for it to finish.";
const NOTHING_TO_READ = "There are no references in Direct or Adjacent to read yet.";
const NONE_FOUND = "I could not find brands with Instagram handles I could confirm. Ask the person which brands they watch.";
const MOVED = "That list was confirmed or replaced a moment ago, so nothing was changed.";
const ADDED_BY_YOU = "Added by you.";
/** A card made this turn has no message yet; it is stored after the reply. */
const UNSAVED = "";

const group = z.enum(["direct", "adjacent"]);

export type MarketToolsInput = {
  market: () => MarketContext | undefined;
  setMarket: (m: MarketContext) => void;
  actions: MarketActions | undefined;
  /** The brands card this turn made, to store after the reply. */
  emit: (card: BrandsCard) => void;
  /** Sentences the turn reports: `tell` what was done, `refuse` what was not (it marks the trace). */
  tell: (sentence: string) => string;
  refuse: (sentence: string) => string;
};

const cap = (brands: MarketBrand[], g: MarketBrand["group"]) => brands.filter((b) => b.keep && b.group === g).length;

export function marketTools(input: MarketToolsInput): Record<string, AgentTool> {
  const { tell, refuse } = input;
  /** The market context while it is open, else the refusal. Throwing sends it back to the model,
   *  which says it in its own words (a tool that ends the turn is never asked again). */
  const open = (): { m: MarketContext; actions: MarketActions } => {
    const m = input.market();
    if (!m?.open || !input.actions) throw new Error(refuse(NOT_OPEN));
    return { m, actions: input.actions };
  };

  return {
    find_brands: {
      description: "Search the web for brands to watch on Instagram for this client's market research, and show them to the person as a list to review. Only when the person asks to research the market or names something to look into.",
      schema: z.object({ focus: z.string().max(300).optional() }),
      label: "Searching the web…",
      // The list is the answer: the reply after it is worded here.
      ends: true,
      run: async (args) => {
        const { m, actions } = open();
        const focus = (args as { focus?: string }).focus?.trim() || null;
        const brands = await actions.findBrands(focus);
        if (brands.length === 0) throw new Error(refuse(NONE_FOUND));
        const card: BrandsCard = { kind: "brands", status: "pending", focus, brands, jobId: null };
        input.emit(card);
        input.setMarket({ ...m, pendingBrands: { messageId: UNSAVED, card } });
        return tell("Here are brands to look at. Switch off any you don't want, or tell me who to add. Nothing is fetched until you confirm.");
      },
    },
    update_brands: {
      description: "Change the list of brands waiting for the person, as they said: add a brand by Instagram handle, drop one, or move one between Direct and Adjacent.",
      schema: z.object({
        add: z.array(z.object({ handle: z.string().min(1).max(200), name: z.string().max(200).optional(), group })).max(10).optional(),
        drop: z.array(z.string().min(1).max(200)).max(20).optional(),
        move: z.array(z.object({ handle: z.string().min(1).max(200), group })).max(20).optional(),
      }),
      label: "Updating the list…",
      run: async (args) => {
        const { m, actions } = open();
        const { add = [], drop = [], move = [] } = args as { add?: { handle: string; name?: string; group: MarketBrand["group"] }[]; drop?: string[]; move?: { handle: string; group: MarketBrand["group"] }[] };
        const pending = m.pendingBrands;
        // A brand added once the last list was fetched starts a new list (spec §4 step 2).
        if (!pending && add.length === 0) return refuse(NO_LIST);
        let brands = pending ? [...pending.card.brands] : [];
        const refusals: string[] = [];
        const find = (raw: string) => {
          const handle = normalizeHandle(raw);
          if (!handle) refusals.push(`"${raw}" is not an Instagram handle.`);
          return handle;
        };
        for (const raw of drop) {
          const handle = find(raw);
          if (handle) brands = brands.map((b) => (b.handle === handle ? { ...b, keep: false } : b));
        }
        for (const { handle: raw, group: g } of move) {
          const handle = find(raw);
          if (handle) brands = brands.map((b) => (b.handle === handle ? { ...b, group: g } : b));
        }
        for (const { handle: raw, name, group: g } of add) {
          const handle = find(raw);
          if (!handle) continue;
          if (handle === m.ownHandle) { refusals.push(`@${handle} is the client itself.`); continue; }
          const existing = brands.find((b) => b.handle === handle);
          const others = brands.filter((b) => b.handle !== handle);
          if (cap(others, g) >= MARKET_BRANDS_PER_GROUP) { refusals.push(`${g === "direct" ? "Direct" : "Adjacent"} already has ${MARKET_BRANDS_PER_GROUP} brands to fetch; drop one first.`); continue; }
          brands = existing
            ? brands.map((b) => (b.handle === handle ? { ...b, group: g, keep: true } : b))
            : [...brands, { handle, name: name?.trim() || handle, why: ADDED_BY_YOU, group: g, keep: true }];
        }
        if (!pending) {
          if (brands.length === 0) return refuse(refusals.join(" ") || NO_LIST);
          const card: BrandsCard = { kind: "brands", status: "pending", focus: null, brands, jobId: null };
          input.emit(card);
          input.setMarket({ ...m, pendingBrands: { messageId: UNSAVED, card } });
          return tell(["Started a new list with what you added. Nothing is fetched until you confirm.", ...refusals].join(" "));
        }
        const card: BrandsCard = { ...pending.card, brands };
        if (pending.messageId === UNSAVED) {
          input.emit(card);
        } else if (!(await actions.updateBrands(pending.messageId, card))) {
          return refuse(MOVED);
        }
        input.setMarket({ ...m, pendingBrands: { messageId: pending.messageId, card } });
        return tell(["Updated the list.", ...refusals].join(" "));
      },
    },
    fetch_posts: {
      description: "Bring in the recent Instagram posts of the brands kept on the waiting list, as references in Direct and Adjacent. Only after the person has said to fetch.",
      schema: z.object({}),
      label: "Starting to bring in their posts…",
      run: async () => {
        const { m, actions } = open();
        const pending = m.pendingBrands;
        if (!pending) return refuse(NO_LIST);
        if (pending.messageId === UNSAVED) return refuse(UNSEEN);
        if (marketJobRunning(m)) return refuse(RUNNING);
        const kept = pending.card.brands.filter((b) => b.keep).length;
        if (kept === 0) return refuse(NONE_KEPT);
        await actions.startFetch(pending.messageId, pending.card);
        input.setMarket({ ...m, pendingBrands: null, job: { kind: "market-fetch", status: "queued", phaseMessage: null } });
        return tell(`Bringing in posts from ${kept} brand${kept === 1 ? "" : "s"}. They appear in Direct and Adjacent as they arrive.`);
      },
    },
    draft_signals: {
      description: "Read the posts in Direct and Adjacent and draft signals from them, as cards the person keeps, edits or drops. Only when the person says to move on to signals, or asks for more.",
      schema: z.object({ focus: z.string().max(300).optional() }),
      label: "Starting to draft signals…",
      run: async (args) => {
        const { m, actions } = open();
        if (marketJobRunning(m)) return refuse(RUNNING);
        if (m.counts.direct + m.counts.adjacent === 0) return refuse(NOTHING_TO_READ);
        await actions.startDraft((args as { focus?: string }).focus?.trim() || null);
        input.setMarket({ ...m, job: { kind: "market-draft", status: "queued", phaseMessage: null } });
        return tell("Reading the posts to draft signals. They will come here as cards to keep, edit or drop.");
      },
    },
  };
}
