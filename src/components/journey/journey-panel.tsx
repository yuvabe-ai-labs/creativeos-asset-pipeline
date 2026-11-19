"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { journeyFoldKey } from "@/lib/journey/frame";
import type { Guide } from "@/lib/journey/guide";
import { JourneyPanelShell } from "./journey-panel-shell";

/** The copilot's guide on a stage's page that has no chat yet (copilot journey spec §4.3): what is
 *  done, what is waiting for the person, and the next approval. */
export function JourneyPanel({ slug, guide }: { slug: string; guide: Guide }) {
  return (
    <JourneyPanelShell foldKey={journeyFoldKey(slug)} waitingLine={guide.waiting && `Waiting for you: ${guide.waiting}`}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" aria-live="polite">
        {guide.done.length > 0 && (
          <ul className="flex flex-col gap-2">
            {guide.done.map((line) => (
              <li key={line} className="flex items-center gap-2 text-sm font-medium text-success-text">
                <Check className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        )}

        {guide.waiting && (
          <p className="flex items-start gap-2 text-sm font-medium text-foreground">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" aria-hidden />
            <span>Waiting for you: {guide.waiting}</span>
          </p>
        )}

        {guide.gate && (
          <div className="flex flex-col gap-1.5 rounded-xl border border-border p-4">
            <p className="text-sm font-medium">{guide.gate.title}</p>
            <p className="text-sm text-muted-foreground">{guide.gate.body}</p>
          </div>
        )}

        {guide.next && (
          <Button
            variant="outline"
            className="self-start"
            nativeButton={false}
            render={<Link href={guide.next.href}>{guide.next.label}</Link>}
          />
        )}
      </div>
    </JourneyPanelShell>
  );
}
