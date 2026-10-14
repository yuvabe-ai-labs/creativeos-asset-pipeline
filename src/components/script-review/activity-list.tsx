// src/components/script-review/activity-list.tsx
"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { ActivityLine } from "@/lib/script-review/types";
import { ActivityEvent } from "./activity-event";

/** How many of the latest events show before the accordion. */
const SHOWN = 2;

/** Spec 4 §7: the review's history as a timeline, latest on top (the lines arrive oldest first). The
 *  latest two show; the rest wait in an accordion. */
export function ActivityList({ lines }: { lines: ActivityLine[] }) {
  const latestFirst = [...lines].reverse();
  const earlier = latestFirst.slice(SHOWN);

  return (
    <section aria-label="Activity" className="flex flex-col gap-3">
      <h2 className="text-eyebrow">Activity</h2>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ol className="flex flex-col">
          {latestFirst.slice(0, SHOWN).map((l, i) => (
            <ActivityEvent key={l.id} line={l} latest={i === 0} />
          ))}
        </ol>
      )}
      {earlier.length > 0 && (
        <Accordion>
          <AccordionItem value="earlier" className="border-none">
            {/* In line with the events' text: the dot and its gap are 20px. */}
            <AccordionTrigger className="justify-start gap-1 py-1 pl-5 text-xs text-muted-foreground hover:no-underline **:data-[slot=accordion-trigger-icon]:ml-0 **:data-[slot=accordion-trigger-icon]:size-3.5">
              {earlier.length} earlier
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <ol className="flex flex-col">
                {earlier.map((l) => (
                  <ActivityEvent key={l.id} line={l} latest={false} />
                ))}
              </ol>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </section>
  );
}
