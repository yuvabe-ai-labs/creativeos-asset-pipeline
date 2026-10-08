// src/components/visualise/panel-hover-line.tsx
/** The shot's visual line over a storyboard tile, on hover or focus (spec 3 testing). Always white
 *  text on a fixed dark scrim, so it reads over a white sketch (the brightest case) and in either
 *  theme; the scrim only covers the bottom of the frame so the panel stays visible above it. The
 *  parent must be `group relative`. */
export function PanelHoverLine({ text }: { text: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-black/85 via-black/65 to-transparent px-3 pb-3 pt-12 opacity-0 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-focus-within:opacity-100 group-hover:opacity-100"
    >
      <p className="line-clamp-5 text-xs font-medium leading-snug text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">{text}</p>
    </div>
  );
}
