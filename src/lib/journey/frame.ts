// Which parts of the client frame a route gets: the stage tabs, the active tab, and the guide
// panel. Pure, so the frame component only reads the pathname and asks here.

export type TabId = "kb" | "market" | "scripts" | "avatars" | "brand-assets";
export type PanelSection = "kb" | "market" | "scripts";
export type Frame = { tabs: boolean; tab: TabId | null; panel: PanelSection | null };

/** The tabs in display order. `stage` tabs carry an approval state; the others are plain sections. */
export const JOURNEY_TABS: { id: TabId; label: string; href: (slug: string) => string; stage: boolean }[] = [
  { id: "kb", label: "Brand KB", href: (slug) => `/clients/${slug}/kb`, stage: true },
  { id: "market", label: "Market research", href: (slug) => `/clients/${slug}/market`, stage: true },
  { id: "scripts", label: "Scripts", href: (slug) => `/clients/${slug}/scripts`, stage: true },
  { id: "avatars", label: "Avatars", href: (slug) => `/clients/${slug}/avatars`, stage: false },
  { id: "brand-assets", label: "Brand assets", href: (slug) => `/clients/${slug}/brand-assets`, stage: false },
];

const NO_FRAME: Frame = { tabs: false, tab: null, panel: null };

export function frameFor(pathname: string, slug: string): Frame {
  const path = pathname.split(/[?#]/)[0];
  const base = `/clients/${slug}`;
  if (path !== base && !path.startsWith(`${base}/`)) return NO_FRAME;
  const [section, ...rest] = path.slice(base.length).split("/").filter(Boolean);
  if (section === undefined) return { tabs: true, tab: null, panel: null };
  // The canvas editor takes the whole window; its guidance is a later piece.
  if (section === "canvases") return NO_FRAME;
  const tab = JOURNEY_TABS.find((t) => t.id === section);
  if (!tab) return { tabs: true, tab: null, panel: null };
  // A stage's own page gets the guide; a script inside Scripts keeps its own copilot.
  const panel = tab.stage && rest.length === 0 ? (tab.id as PanelSection) : null;
  return { tabs: true, tab: tab.id, panel };
}
