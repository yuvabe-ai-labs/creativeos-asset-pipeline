// The editor page's layout (D403): which side panels show and how tall the timeline is. Pure;
// use-editor-layout keeps it per browser.
export type EditorLayout = { sources: boolean; inspector: boolean; timelineHeight: number };

export const DEFAULT_LAYOUT: EditorLayout = { sources: true, inspector: true, timelineHeight: 300 };
export const MIN_TIMELINE = 180;
/** Room the header and a usable stage need above the timeline. */
const TOP_RESERVE = 280;

export function clampTimelineHeight(h: number, viewport: number): number {
  return Math.round(Math.max(MIN_TIMELINE, Math.min(Math.max(MIN_TIMELINE, viewport - TOP_RESERVE), h)));
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
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}
