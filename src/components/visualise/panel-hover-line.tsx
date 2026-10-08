// src/components/visualise/panel-hover-line.tsx
/** The shot's visual line over a storyboard tile, on hover or focus (spec 3 testing). The scrim is
 *  sized for a white sketch, the brightest case. The parent must be `group relative`. */
export function PanelHoverLine({ text }: { text: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-foreground/90 via-foreground/70 to-transparent px-3 pb-3 pt-10 opacity-0 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-focus-within:opacity-100 group-hover:opacity-100"
    >
      <p className="line-clamp-5 text-xs leading-snug text-background">{text}</p>
    </div>
  );
}
