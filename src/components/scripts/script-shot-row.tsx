import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { shotAnchor } from "@/lib/scripts/anchors";
import type { CastMember } from "@/lib/scripts/schema";
import { formatRange, type TimedShot } from "@/lib/scripts/timeline";

/** What a stage says about one shot in the compact row (Visualise: open its panel; drawing). */
export type ShotState = { onOpen?: () => void; drawing?: boolean };

/** Shared with the column header in ScriptShotList so the two always line up. */
export const SHOT_GRID = "md:grid-cols-[4.5rem_minmax(0,2.2fr)_minmax(0,1.8fr)_minmax(0,1.2fr)_8rem]";

/** A commented part (spec 4) gets a faint client-feedback tint, read off its PartComments. */
const COMMENTED = "has-[[data-part-commented]]:bg-client/5";

export function ScriptShotRow({ timed, cast, compact = false, aside, state, after }: {
  timed: TimedShot;
  cast: CastMember[];
  /** Stacked, for a narrow pane (Visualise). */
  compact?: boolean;
  /** Beside a compact row (Visualise: the panel status). */
  aside?: ReactNode;
  /** A compact row's click target and drawing state. */
  state?: ShotState;
  /** Under the row, full width (spec 4: the shot's comments). */
  after?: ReactNode;
}) {
  const { shot } = timed;
  const names = shot.onScreen.map((id) => cast.find((c) => c.id === id)?.name).filter(Boolean);
  const who = names.length > 0 ? names.join(", ") : "Nobody (B-roll)";
  if (compact) {
    const text = (
      <>
        <span className="flex w-12 shrink-0 flex-col text-sm tabular-nums text-muted-foreground">
          <span className="font-medium text-foreground">S{timed.index + 1}</span>
          {formatRange(timed.start, timed.end)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm text-foreground">{shot.visual}</span>
          {shot.vo && <span className="text-sm text-muted-foreground">{shot.vo}</span>}
          {shot.onScreenText && <span className="text-sm font-medium text-foreground">{shot.onScreenText}</span>}
          <span className="text-xs text-muted-foreground">{who}</span>
        </span>
        {/* While its panel draws, a faint sweep over the shot (the Skeleton's shimmer, neutral). */}
        {state?.drawing && (
          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
            <span className="animate-shimmer absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent" />
          </span>
        )}
      </>
    );
    const box = "relative flex min-w-0 flex-1 items-start gap-3";
    return (
      <li
        id={shotAnchor(shot.id)}
        className={`flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0 ${COMMENTED}`}
        aria-busy={state?.drawing || undefined}
      >
        <div className="flex items-start gap-3">
          {state?.onOpen ? (
            <Button
              variant="ghost"
              aria-label={`Open the S${timed.index + 1} panel`}
              onClick={state.onOpen}
              className={`${box} -m-1.5 h-auto justify-start whitespace-normal rounded-md p-1.5 text-left font-normal`}
            >
              {text}
            </Button>
          ) : (
            <div className={`${box} rounded-md`}>{text}</div>
          )}
          {aside !== undefined && <div className="shrink-0">{aside}</div>}
        </div>
        {after ? <div>{after}</div> : null}
      </li>
    );
  }
  return (
    <li id={shotAnchor(shot.id)} className={`grid gap-3 border-b border-border px-4 py-3 last:border-b-0 ${COMMENTED} ${SHOT_GRID}`}>
      <span className="flex flex-col text-sm tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">S{timed.index + 1}</span>
        {formatRange(timed.start, timed.end)}
      </span>
      <span className="text-sm">{shot.visual}</span>
      <span className="text-sm text-muted-foreground">{shot.vo}</span>
      <span className="text-sm font-medium">{shot.onScreenText}</span>
      <span className="text-xs text-muted-foreground">{who}</span>
      {after ? <div className="md:col-span-5">{after}</div> : null}
    </li>
  );
}
