"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { OpenItem, ScriptNotes } from "@/lib/scripts/copilot/schema";
import { useScriptEdit } from "../script-edit-context";
import { ScriptText } from "../script-text";

/** Spec 2 §4.2 — the reel's own notes, under the script: the confirmed brief (edited like the
 *  script), the items to confirm, and what fill to final is still waiting on (§8). */
export function ScriptNotesPanel({ notes, openItems }: { notes: ScriptNotes; openItems: OpenItem[] }) {
  const edit = useScriptEdit();
  return (
    <section aria-label="The reel's notes" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex flex-col gap-1">
        <h2 className="text-eyebrow">The reel&apos;s notes</h2>
        <p className="text-sm text-muted-foreground">For this reel only: the brief it was written from, and what is still to settle.</p>
      </div>
      <div className="text-sm leading-relaxed">
        <ScriptText path="notes.brief" value={notes.brief} placeholder="Add notes for this reel…" />
      </div>
      {notes.confirmations.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-eyebrow">To confirm before Final</span>
          {notes.confirmations.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <Checkbox
                id={`confirm-${c.id}`}
                checked={c.confirmed}
                onCheckedChange={(checked) => edit?.commit(`notes.confirm.${c.id}`, checked === true ? "yes" : "no")}
              />
              <Label htmlFor={`confirm-${c.id}`} className={cn("text-sm font-normal leading-snug", c.confirmed && "text-muted-foreground line-through")}>{c.text}</Label>
            </div>
          ))}
        </div>
      )}
      {openItems.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <span className="text-eyebrow">Still open</span>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-sm">
            {openItems.map((i) => (
              <li key={i.id}><span className="font-medium">{i.label}.</span> <span className="text-muted-foreground">{i.question}</span></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
