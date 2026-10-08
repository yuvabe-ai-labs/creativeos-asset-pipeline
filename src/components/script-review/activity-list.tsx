// src/components/script-review/activity-list.tsx
"use client";

import { formatDayTime } from "@/lib/script-review/utils";
import type { ActivityLine } from "@/lib/script-review/types";
import { PartLink } from "./part-link";

/** Spec 4 §7: the review's history, oldest first; a "revised" line links to each part. */
export function ActivityList({ lines }: { lines: ActivityLine[] }) {
  return (
    <section aria-label="Activity" className="flex flex-col gap-3">
      <h2 className="text-eyebrow">Activity</h2>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {lines.map((l) => (
            <li key={l.id} className="flex flex-col gap-0.5 text-sm">
              <span>{l.text}</span>
              {l.links.length > 0 && (
                <span className="flex flex-wrap gap-x-3">
                  {l.links.map((link) => (
                    <PartLink key={`${l.id}:${link.label}`} part={link.part} label={link.label} />
                  ))}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{formatDayTime(l.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
