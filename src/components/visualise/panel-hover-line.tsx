// src/components/visualise/panel-hover-line.tsx
/** The shot's visual line over a storyboard tile, on hover or focus (spec 3 testing). The scrim tokens
 *  keep it white on dark in both themes, so it reads over a white sketch, the brightest case; the
 *  scrim covers only the bottom of the frame, so the panel stays visible above it. The parent must
 *  be `group relative`. */
export function PanelHoverLine({ text }: { text: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-scrim/85 via-scrim/65 to-transparent px-3 pb-3 pt-12 opacity-0 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-focus-within:opacity-100 group-hover:opacity-100"
    >
      <p className="line-clamp-5 scrim-text text-xs font-medium leading-snug">{text}</p>
    </div>
  );
}
