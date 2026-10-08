"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import type { Script } from "@/lib/scripts/schema";
import { SCRIPT_STAGES, SCRIPT_STAGE_LABEL, type ScriptStage } from "@/lib/scripts/constants";
import { ScriptCard } from "./script-card";

type Filter = "all" | ScriptStage;

// Spec 1 §3. No "New script" yet: it arrives with spec 2, because the copilot is the only way a
// script is made, and a button that does nothing would be worse than none.
export function ScriptsLibrary({ clientName, clientSlug, scripts }: { clientName: string; clientSlug: string; scripts: Script[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? scripts : scripts.filter((s) => s.stage === filter);
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: scripts.length },
    ...SCRIPT_STAGES.map((stage) => ({
      id: stage, label: SCRIPT_STAGE_LABEL[stage], count: scripts.filter((s) => s.stage === stage).length,
    })),
  ];

  return (
    <section className="animate-rise mt-4 flex flex-col gap-8">
      <header className="flex flex-col gap-1.5">
        <span className="text-eyebrow">{clientName}</span>
        <h1 className="font-display text-3xl font-medium">Scripts</h1>
        <p className="max-w-xl text-muted-foreground">Every reel script for this client, from first draft to client sign-off.</p>
      </header>

      {scripts.length === 0 ? (
        <EmptyState
          title="No scripts yet"
          body="Scripts are written with the copilot, then visualised and sent to the client for sign-off."
        />
      ) : (
        <>
          <div role="group" aria-label="Filter by stage" className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <Button
                key={f.id}
                variant="outline"
                size="sm"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn("rounded-full", filter === f.id && "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background")}
              >
                {f.label}
                <span className={cn("tabular-nums", filter === f.id ? "text-background/70" : "text-muted-foreground")}>{f.count}</span>
              </Button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scripts at this stage.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
              {shown.map((s) => (
                <ScriptCard key={s.id} script={s} href={`/clients/${clientSlug}/scripts/${s.id}`} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
