// The editor page's layout (D403): which side panels show and how tall the timeline is, and — for
// the one side panel of the task-menu design — which side it sits on and its share of the width.
// Pure; use-editor-layout keeps it per browser.
export type PanelDock = "left" | "right";
export type EditorLayout = { sources: boolean; inspector: boolean; timelineHeight: number; panelShare: number; panelDock: PanelDock };

/** The design's split: preview 3, side panel 2. */
export const DEFAULT_PANEL_SHARE = 0.4;
export const MIN_PANEL_SHARE = 0.2;
export const MAX_PANEL_SHARE = 0.6;

export const DEFAULT_LAYOUT: EditorLayout = { sources: true, inspector: true, timelineHeight: 300, panelShare: DEFAULT_PANEL_SHARE, panelDock: "right" };
export const MIN_TIMELINE = 180;
/** Room the header and a usable stage need above the timeline. */
const TOP_RESERVE = 280;

export function clampTimelineHeight(h: number, viewport: number): number {
  return Math.round(Math.max(MIN_TIMELINE, Math.min(Math.max(MIN_TIMELINE, viewport - TOP_RESERVE), h)));
}

/** The side panel's share of the width, kept where both it and the preview stay usable. */
export function clampPanelShare(share: number): number {
  if (!Number.isFinite(share)) return DEFAULT_PANEL_SHARE;
  return Math.round(Math.max(MIN_PANEL_SHARE, Math.min(MAX_PANEL_SHARE, share)) * 1000) / 1000;
}

/** A stored layout, or the default when it is missing or not ours. */
export function readLayout(raw: string | null): EditorLayout {
  if (!raw) return DEFAULT_LAYOUT;
  try {
    const v = JSON.parse(raw) as Partial<EditorLayout>;
    return {
      sources: typeof v.sources === "boolean" ? v.sources : DEFAULT_LAYOUT.sources,
      inspector: typeof v.inspector === "boolean" ? v.inspector : DEFAULT_LAYOUT.inspector,
      timelineHeight: typeof v.timelineHeight === "number" && Number.isFinite(v.timelineHeight) ? v.timelineHeight : DEFAULT_LAYOUT.timelineHeight,
      panelShare: typeof v.panelShare === "number" ? clampPanelShare(v.panelShare) : DEFAULT_LAYOUT.panelShare,
      panelDock: v.panelDock === "left" || v.panelDock === "right" ? v.panelDock : DEFAULT_LAYOUT.panelDock,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}
