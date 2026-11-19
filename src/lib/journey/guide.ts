import type { PanelSection } from "./frame";
import type { JourneyState } from "./stages";

// What the guide panel says on a stage's page (spec 2026-11-12 §4.3): what is done, the one thing
// waiting for the person, the next approval, and where to go when this stage has nothing left.
// Worked out from the client's status alone; the stage agents replace this in later pieces.

export type Guide = {
  done: string[];
  waiting: string | null;
  gate: { title: string; body: string } | null;
  next: { label: string; href: string } | null;
  /** The page's own "New script" action, offered by the guide (scripting-panel spec §3.1). */
  newScript: { label: "Start a script" | "Paste a script" } | null;
};

/** The Brand KB page has the brand KB copilot instead of a guide (kb-copilot.tsx). */
export function guideFor({ section, state, slug }: {
  section: Exclude<PanelSection, "kb">;
  state: JourneyState;
  slug: string;
}): Guide {
  const done = [
    ...(state.kb === "approved" ? ["Brand KB approved"] : []),
    ...(state.market === "approved" ? ["Market research approved"] : []),
  ];
  const toKb = { label: "Go to brand KB", href: `/clients/${slug}/kb` };
  const toMarket = { label: "Go to market research", href: `/clients/${slug}/market` };
  const toScripts = { label: "Go to scripts", href: `/clients/${slug}/scripts` };

  if (section === "market") {
    if (state.market === "approved") return { done, waiting: null, gate: null, next: toScripts, newScript: null };
    if (state.market === "locked") {
      return {
        done,
        waiting: "Approve the brand KB first",
        gate: { title: "Market research is locked", body: "It opens once the brand KB is approved." },
        next: toKb,
        newScript: null,
      };
    }
    return {
      done,
      waiting: "Collect references, then approve market research",
      gate: {
        title: "Next stop: market research approval",
        body: "Approve the research when it reflects the market. Scripts open after that. I can't approve it for you.",
      },
      next: null,
      newScript: null,
    };
  }

  if (state.scripts === "locked") {
    return {
      done,
      waiting: "Approve market research to write a new script",
      gate: {
        title: "Scripts are locked",
        body: "New scripts open once market research is approved. You can still paste a script you already have.",
      },
      next: toMarket,
      newScript: { label: "Paste a script" },
    };
  }
  return { done, waiting: "Start a new script", gate: null, next: null, newScript: { label: "Start a script" } };
}
