import type { ThreadMessage, Waiting } from "@/lib/journey/thread/schema";
import { isBuilding, type KbContext } from "./context";
import { pendingBrands, type MarketContext } from "@/lib/journey/market-copilot/context";
import { unreviewedByModule } from "./review";
import { walkOf } from "./walk";

// What the brand KB stage is waiting on the person for (journey spec §4.3), worked out on every
// read from the stored KB and the thread. Never stored, so it follows a review done by hand. Pure.

/** The approval this stage's gate card asks for; the Brand KB page's component carries it out. */
export const APPROVE_KB_ACTION = "approve-kb";

/** The approval market research's gate card asks for; the Market page's guide carries it out. */
export const APPROVE_MARKET_ACTION = "approve-market";

/** While market research is pending (D530): a card in the thread to review first, else the gate. */
function marketWaiting(slug: string, m: MarketContext, messages: ThreadMessage[]): Waiting | null {
  if (!m.open || m.status !== "pending") return null;
  const links = [{ label: "Market research", href: `/clients/${slug}/market` }];
  if (pendingBrands(messages)) {
    return { kind: "task", label: "Review the brands", text: "Keep the brands to look at, then tell me to fetch their posts.", links };
  }
  const drafts = messages.filter((x) => x.card?.kind === "signal-draft" && x.card.status === "pending").length;
  if (drafts > 0) {
    const label = drafts === 1 ? "Review 1 signal" : `Review ${drafts} signals`;
    return { kind: "task", label, text: "Keep, edit or drop each drafted signal in the chat.", links };
  }
  return {
    kind: "gate",
    label: "Approve market research",
    title: "Approve market research",
    opens: "Approve market research when it reflects the market. That opens scripts.",
    why: "Only a person can approve it. I never do.",
    action: APPROVE_MARKET_ACTION,
  };
}

export function kbWaiting(ctx: KbContext, messages: ThreadMessage[]): Waiting | null {
  // The copilot asks nothing while a build runs (spec §2.2).
  if (isBuilding(ctx)) return null;
  // A change card waits on a person until it is settled, on an approved KB too (spec §3).
  const cards = messages.filter((m) => m.card?.kind === "change" && m.card.status === "pending").length;
  const change: Waiting | null = cards > 0 ? { kind: "change", label: cards === 1 ? "Approve the change" : `Approve ${cards} changes` } : null;
  // An approved KB waits on nobody else; market research, next, may (D530).
  if (ctx.kbStatus === "ready") return change ?? (ctx.market ? marketWaiting(ctx.clientSlug, ctx.market, messages) : null);

  if (!ctx.hasVersion) {
    const last = messages[messages.length - 1];
    return last?.role === "assistant" ? { kind: "reply", label: "Your reply" } : null;
  }

  // Not read: say nothing. An unknown count must never look like "nothing left", which is the gate.
  if (ctx.unreviewed === null) return change;

  const { pending } = walkOf(messages);
  if (pending && ctx.unreviewed.includes(pending)) return { kind: "reply", label: "Your answer" };
  if (change) return change;

  const left = ctx.unreviewed.length;
  if (left > 0) {
    return {
      kind: "task",
      label: `Review ${left} field${left === 1 ? "" : "s"}`,
      text: `${left} field${left === 1 ? " is" : "s are"} still to review on the right.`,
      links: unreviewedByModule(ctx.unreviewed).map((m) => ({
        label: `${m.label} · ${m.count}`,
        href: `/clients/${ctx.clientSlug}/kb?section=${m.module}`,
      })),
    };
  }

  return {
    kind: "gate",
    label: "Approve the brand KB",
    title: "Approve the brand KB",
    opens: "Approving it opens market research.",
    why: "Only a person can approve it. I never do.",
    action: APPROVE_KB_ACTION,
  };
}
