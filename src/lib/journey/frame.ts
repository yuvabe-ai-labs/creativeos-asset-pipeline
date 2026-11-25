import type { ScriptStage } from "@/lib/scripts/constants";

// Which parts of the client frame a route gets: the stage tabs, the active tab, and the guide
// panel. Pure, so the frame component only reads the pathname and asks here.

export type TabId = "kb" | "market" | "scripts" | "canvases" | "avatars" | "brand-assets";
export type PanelSection = "kb" | "market" | "scripts";
/** `panel`: a stage's own page shows that stage's panel; "current" shows the panel of whichever
 *  stage the client is at (stages.ts currentStage); null is a page with no panel of the frame's. */
export type Frame = { tabs: boolean; tab: TabId | null; panel: PanelSection | "current" | null };

/** The tabs in display order. `stage` tabs carry an approval state; the others are plain sections. */
export const JOURNEY_TABS: { id: TabId; label: string; href: (slug: string) => string; stage: boolean }[] = [
  { id: "kb", label: "Brand KB", href: (slug) => `/clients/${slug}/kb`, stage: true },
  { id: "market", label: "Market research", href: (slug) => `/clients/${slug}/market`, stage: true },
  { id: "scripts", label: "Scripts", href: (slug) => `/clients/${slug}/scripts`, stage: true },
  // The client's home page is its list of canvases: where an approved script ends up.
  { id: "canvases", label: "Canvases", href: (slug) => `/clients/${slug}`, stage: false },
  { id: "avatars", label: "Avatars", href: (slug) => `/clients/${slug}/avatars`, stage: false },
  { id: "brand-assets", label: "Brand assets", href: (slug) => `/clients/${slug}/brand-assets`, stage: false },
];

const NO_FRAME: Frame = { tabs: false, tab: null, panel: null };

export function frameFor(pathname: string, slug: string): Frame {
  const path = pathname.split(/[?#]/)[0];
  const base = `/clients/${slug}`;
  if (path !== base && !path.startsWith(`${base}/`)) return NO_FRAME;
  const [section, ...rest] = path.slice(base.length).split("/").filter(Boolean);
  // The client's home is the Canvases tab: a plain list, with no copilot beside it.
  if (section === undefined) return { tabs: true, tab: "canvases", panel: null };
  // The canvas editor takes the whole window; its guidance is a later piece.
  if (section === "canvases") return NO_FRAME;
  // On the other tabs the panel stays in place and only the page beside it changes. Where the page
  // is not a stage's own (Avatars, Brand assets), it shows the stage the client is at.
  const tab = JOURNEY_TABS.find((t) => t.id === section);
  if (!tab) return { tabs: true, tab: null, panel: null };
  // Inside a script there is no frame at all. A script is its own thread with its own copilot, so
  // the client's tabs (which belong to the onboarding thread) step aside; the script's page
  // carries the whole trail back (Clients › client › Scripts › script).
  if (tab.id === "scripts" && rest.length > 0) return NO_FRAME;
  // Any other page inside a tab has the whole width (an avatar's studio), with the tabs kept.
  const panel = rest.length > 0 ? null : tab.stage ? (tab.id as PanelSection) : "current";
  return { tabs: true, tab: tab.id, panel };
}

/** Where the guide's folded state is remembered (use-copilot-collapsed), one per client. The frame
 *  and the panel both read it, so the column and the panel fold together. */
export const journeyFoldKey = (slug: string) => `journey.${slug}`;

/** A script's panel has two fold memories (scripting-panel spec §3.2): Generate's, which keeps the
 *  key it always had so a panel folded before stays folded, and one shared by every later stage. */
export const scriptFoldKey = (scriptId: string, stage: ScriptStage) =>
  stage === "generate" ? scriptId : `${scriptId}.after-generate`;
