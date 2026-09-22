"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
//
// LAYOUT (operator request 2026-09-23, "its so clumsy"): the speaker sits UNDER its line, not in a
// 64px column beside it. Side by side, the two fields split an already-narrow cut card between
// them and the line wrapped every three or four words. Stacked, the spoken words get the full
// width and the speaker reads as the caption it is. The remove control appears on hover so a
// column of lines is a column of words, not a column of buttons.
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
    <div className="grid gap-1.5">
      {rows.map((line, i) => (
        <div
          key={i}
          className={cn(
            "group/vo-line flex items-start gap-1 rounded-md px-1.5 py-1",
            // A faint tint marks the spoken words as a different KIND of content from the shot
            // description above them — the same primary wash the plan view uses for the line it
            // appends to the prompt.
            "bg-primary/[0.04]",
          )}
        >
          <div className="min-w-0 flex-1">
            <EditableField
              value={line.text}
              onCommit={(text) => updateLine(i, { text })}
              readOnly={readOnly}
              multiline
              placeholder="Spoken line…"
              className="text-xs leading-snug text-primary/90"
              // Content-sized and unboxed, so a line inside an already-scrolling card does not
              // introduce a second scrollbar or a shifted text column.
              editClassName="min-h-0 resize-none rounded border-0 bg-primary/5 px-1 py-0.5 text-xs shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-xs"
            />
            <EditableField
              // "narrator" is the unspoken default (D267 — same convention `renderVoiceover` uses),
              // so it displays as empty with a placeholder rather than as literal text.
              value={line.speaker === "narrator" ? "" : line.speaker}
              onCommit={(speaker) =>
                updateLine(i, { speaker: speaker.trim() === "" ? "narrator" : speaker })
              }
              readOnly={readOnly}
              placeholder="narrator"
              className="text-eyebrow text-muted-foreground"
              editClassName="h-auto rounded border-0 bg-primary/5 px-1 py-0.5 text-[0.65rem] shadow-none focus-visible:border-0 focus-visible:ring-0"
            />
          </div>
          {!readOnly && (
            <Button
              variant="ghost"
              aria-label="Remove line"
              onClick={() => removeLine(i)}
              className="nodrag h-auto shrink-0 rounded-md p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-muted-foreground focus-visible:opacity-100 group-hover/vo-line:opacity-100 dark:hover:bg-muted"
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
