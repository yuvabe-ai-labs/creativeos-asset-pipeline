"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import type { Script } from "@/lib/scripts/schema";
import type { UnwrittenScript } from "@/lib/scripts/copilot/schema";
import { SCRIPT_STAGES, SCRIPT_STAGE_LABEL, type ScriptStage } from "@/lib/scripts/constants";
import { ScriptCard } from "./script-card";
import { ScriptUnwrittenCard } from "./script-unwritten-card";
import { NewScriptButton } from "./new-script-button";

type Filter = "all" | ScriptStage;

// Spec 1 §3, with spec 2's New script and the scripts the copilot has not written yet, and spec 4's
// client-feedback count on each card.
export function ScriptsLibrary({ clientId, clientName, clientSlug, scripts, unwritten, feedback }: {
  clientId: string;
  clientName: string;
  clientSlug: string;
  scripts: Script[];
  unwritten: UnwrittenScript[];
  feedback?: Record<string, number>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? scripts : scripts.filter((s) => s.stage === filter);
  // A script with no draft yet is at Generate.
  const shownUnwritten = filter === "all" || filter === "generate" ? unwritten : [];
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: scripts.length + unwritten.length },
    ...SCRIPT_STAGES.map((stage) => ({
      id: stage,
      label: SCRIPT_STAGE_LABEL[stage],
      count: scripts.filter((s) => s.stage === stage).length + (stage === "generate" ? unwritten.length : 0),
    })),
  ];

  return (
    <section className="animate-rise mt-4 flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-eyebrow">{clientName}</span>
          <h1 className="font-display text-3xl font-medium">Scripts</h1>
          <p className="max-w-xl text-muted-foreground">Every reel script for this client, from first draft to client sign-off.</p>
        </div>
        <NewScriptButton clientId={clientId} clientSlug={clientSlug} />
      </header>

      {scripts.length === 0 && unwritten.length === 0 ? (
        <EmptyState
          title="No scripts yet"
          body="Scripts are written with the copilot, then visualised and sent to the client for sign-off."
          action={<NewScriptButton clientId={clientId} clientSlug={clientSlug} />}
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
          {shown.length === 0 && shownUnwritten.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scripts at this stage.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
              {shownUnwritten.map((u) => (
                <ScriptUnwrittenCard key={u.id} clientId={clientId} script={u} href={`/clients/${clientSlug}/scripts/${u.id}`} />
              ))}
              {shown.map((s) => (
                <ScriptCard key={s.id} script={s} href={`/clients/${clientSlug}/scripts/${s.id}`} feedbackCount={feedback?.[s.id] ?? 0} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
