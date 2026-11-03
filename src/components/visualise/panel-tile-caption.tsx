// D465 — a storyboard panel's shot, written under its frame as on a classic storyboard sheet:
// the number, beat and time, then the action, then the spoken line. Shared by the team's tile
// and the client's.
export function PanelTileCaption({ label, beat, time, visual, vo }: {
  label: string;
  beat: string;
  time: string;
  visual: string;
  vo: string;
}) {
  return (
    <figcaption className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="font-medium text-foreground">{label}</span>
          {beat && <span className="truncate text-eyebrow">{beat}</span>}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{time}</span>
      </span>
      <span className="line-clamp-3 text-sm text-foreground">{visual}</span>
      {vo && <span className="line-clamp-2 text-sm text-muted-foreground">“{vo}”</span>}
    </figcaption>
  );
}
