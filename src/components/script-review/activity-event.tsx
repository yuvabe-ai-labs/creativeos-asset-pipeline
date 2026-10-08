// src/components/script-review/activity-event.tsx
"use client";

import { formatDayTime } from "@/lib/script-review/utils";
import type { ActivityLine } from "@/lib/script-review/types";
import { PartLink } from "./part-link";

/** The rail from one event's dot to the next: 1px down the dots' centre, stopping 4px clear of both,
 *  so a hollow dot needs no fill to match the column or the sheet behind it. The dot is 8px and 6px
 *  from the top, which centres it on the first line of `text-sm`. */
const RAIL =
  "before:absolute before:left-[3.5px] before:top-4.5 before:-bottom-0.5 before:w-px before:bg-border last:before:hidden";

/** One event on the Activity timeline: its dot (filled for the latest), what happened, a link to each
 *  part a "revised" line names, and when. */
export function ActivityEvent({ line, latest }: { line: ActivityLine; latest: boolean }) {
  return (
    <li className={`relative flex gap-3 pb-3 text-sm last:pb-0 ${RAIL}`}>
      <span
        aria-hidden
        data-dot={latest ? "latest" : "past"}
        className={`mt-1.5 size-2 shrink-0 rounded-full border ${latest ? "border-foreground bg-foreground" : "border-muted-foreground/40"}`}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span>{line.text}</span>
        {line.links.length > 0 && (
          <span className="flex flex-wrap gap-x-3">
            {line.links.map((link) => (
              <PartLink key={`${line.id}:${link.label}`} part={link.part} label={link.label} />
            ))}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{formatDayTime(line.at)}</span>
      </div>
    </li>
  );
}
