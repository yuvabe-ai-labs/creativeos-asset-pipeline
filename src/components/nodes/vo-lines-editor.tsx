"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableField } from "./editable-field";
import type { VoLine } from "@/lib/nodes/voiceover";

type VoLinesEditorProps = {
  lines: VoLine[] | undefined;
  onChange?: (next: VoLine[]) => void;
  readOnly?: boolean;
};

// Task 6 — the shot row is the one place a spoken line is read and edited (operator: "we planned
// to associate voice with each shot right? why still separate VO there?"). One component, used by
// the Script document's shot rows, the Multishot cut card, and the (read-only) Shot node — see
// D267 §3.5 refinement in the ADR log.
//
// `lines === undefined` (a script parsed before per-shot lines existed) and `lines === []` (the
// script says this shot is silent) are different states and stay distinguishable in the data;
// on screen both currently render the same way when there's nothing to show (no rows, and no
// affordance at all under `readOnly`) — the distinction matters to the parse and to
// `voiceoverMappingIssue`, not to what an empty list looks like.
export function VoLinesEditor({ lines, onChange, readOnly = false }: VoLinesEditorProps) {
  const rows = lines ?? [];
  if (readOnly && rows.length === 0) return null;

  function commit(next: VoLine[]) {
    onChange?.(next);
  }

  function updateLine(i: number, patch: Partial<VoLine>) {
    // Spread the existing line: `delivery` and `language` are not edited here and must ride
    // through untouched.
    commit(rows.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function removeLine(i: number) {
    commit(rows.filter((_, idx) => idx !== i));
  }

  function addLine() {
    commit([...rows, { text: "", speaker: "narrator" }]);
  }

  return (
    <div className="mt-1.5 grid gap-1">
      {rows.map((line, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1">
            <EditableField
              value={line.text}
              onCommit={(text) => updateLine(i, { text })}
              readOnly={readOnly}
              multiline
              placeholder="Spoken line…"
              className="text-xs leading-snug"
            />
          </div>
          <EditableField
            // "narrator" is the unspoken default (D267 — same convention `renderVoiceover` uses),
            // so it displays as empty with a placeholder rather than as literal text.
            value={line.speaker === "narrator" ? "" : line.speaker}
            onCommit={(speaker) =>
              updateLine(i, { speaker: speaker.trim() === "" ? "narrator" : speaker })
            }
            readOnly={readOnly}
            placeholder="narrator"
            className="w-16 shrink-0 text-[0.65rem] text-muted-foreground"
          />
          {!readOnly && (
            <Button
              variant="ghost"
              aria-label="Remove line"
              onClick={() => removeLine(i)}
              className="nodrag h-auto shrink-0 rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted"
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          variant="ghost"
          onClick={addLine}
          className="nodrag h-auto w-fit rounded-md border border-dashed border-primary/40 px-2 py-1 text-[0.65rem] text-primary hover:border-primary/60 hover:bg-primary/5 hover:text-primary dark:hover:bg-primary/5"
        >
          <Plus className="size-3" /> Add line
        </Button>
      )}
    </div>
  );
}
