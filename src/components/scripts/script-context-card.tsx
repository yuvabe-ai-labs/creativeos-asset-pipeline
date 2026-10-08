"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { ScriptStage } from "@/lib/scripts/constants";
import { headerLine, reelLabel, shotSummary } from "@/lib/scripts/utils";
import { ScriptStageBadge } from "./script-stage-badge";
import { useScriptEdit } from "./script-edit-context";
import { ScriptText } from "./script-text";
import { ScriptHeaderFields } from "./script-header-fields";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-eyebrow">{label}</span>
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

export function ScriptContextCard({ doc, stage }: { doc: ScriptDoc; stage: ScriptStage }) {
  const { header, context } = doc;
  // Spec 2: in the Generate workspace every section shows, empty or not, so it can be filled.
  const editing = useScriptEdit() !== null;
  const [addingWatchOut, setAddingWatchOut] = useState(false);
  const facts = [headerLine(header), header.theme, [header.aspect, header.targetLength].filter(Boolean).join(", "), header.production]
    .filter(Boolean)
    .join(" · ");
  return (
    <section aria-label="Context" className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{reelLabel(header.reelNumber)}</span>
          <h1 className="font-display text-2xl font-medium"><ScriptText path="header.title" value={header.title} multiline={false} /></h1>
          {editing ? <ScriptHeaderFields header={header} /> : <span className="text-sm text-muted-foreground">{facts}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{shotSummary(doc)}</span>
          <ScriptStageBadge stage={stage} />
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {(context.purpose || editing) && <Section label="Purpose"><ScriptText path="context.purpose" value={context.purpose} /></Section>}
        {(context.settingAndCamera || editing) && <Section label="Setting and camera"><ScriptText path="context.settingAndCamera" value={context.settingAndCamera} /></Section>}
      </div>
      {(context.disclaimers || context.watchOuts.length > 0 || editing) && (
        <div className="grid gap-5 border-t border-border pt-5 md:grid-cols-2">
          {(context.disclaimers || editing) && <Section label="Disclaimers"><ScriptText path="context.disclaimers" value={context.disclaimers} /></Section>}
          {(context.watchOuts.length > 0 || editing) && (
            <Section label="Watch-outs">
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {context.watchOuts.map((w, i) => <li key={`${i}-${w}`}><ScriptText path={`context.watchOuts.${i}`} value={w} /></li>)}
                {editing && (addingWatchOut ? (
                  <li><ScriptText path={`context.watchOuts.${context.watchOuts.length}`} value="" initiallyEditing onDone={() => setAddingWatchOut(false)} /></li>
                ) : (
                  <li className="list-none">
                    <Button variant="outline" size="xs" className="-ml-4 border-dashed border-primary/40 text-primary hover:bg-primary/5" onClick={() => setAddingWatchOut(true)}>
                      <Plus strokeWidth={1.5} /> Add a watch-out
                    </Button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </section>
  );
}
