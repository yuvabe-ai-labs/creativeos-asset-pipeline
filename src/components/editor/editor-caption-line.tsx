"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { editCaption, removeCaption } from "@/lib/editor/captions";
import { captionWords } from "@/lib/editor/caption-words";
import type { Caption } from "@/lib/editor/types";
import { cn } from "@/lib/utils";
import { useEditorStore } from "./editor-store-provider";

const SPREAD_NOTE = "The word count changed, so this line's timing is spread evenly. Auto captions again gives exact timing.";

/** One line of the Text tab: click its words to fix them (Enter saves, Esc cancels), hover to
 *  delete. Words the transcript was unsure of get a wavy underline (spec §9). */
export function EditorCaptionLine({ caption, start, selected, playing, unsure, onSelect }: {
  caption: Caption;
  start: string;
  selected: boolean;
  playing: boolean;
  unsure: ReadonlySet<number>;
  onSelect(): void;
}) {
  const apply = useEditorStore((s) => s.apply);
  const editable = useEditorStore((s) => s.editable);
  const [draft, setDraft] = useState<string | null>(null);

  const save = () => {
    if (draft === null) return;
    let spread = false;
    apply((d) => {
      const r = editCaption(d, caption.id, draft);
      spread = r.spread;
      return r.doc;
    });
    if (spread) toast(SPREAD_NOTE, { id: "caption-spread" });
    setDraft(null);
  };
  const words = captionWords(caption);

  return (
    <div
      data-caption-row={caption.id}
      onClick={onSelect}
      className={cn(
        "group relative grid cursor-pointer grid-cols-[48px_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors duration-200 hover:bg-muted",
        selected && "border-primary/40 bg-primary/5 hover:bg-primary/5",
        playing && "before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
      )}
    >
      <span className="pt-0.5 text-[11px] tabular-nums text-muted-foreground">{start}</span>
      {draft !== null ? (
        <Input
          autoFocus
          value={draft}
          aria-label="Caption text"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDraft(null);
            }
          }}
          className="h-7 text-[13.5px]"
        />
      ) : (
        <span
          onClick={(e) => {
            if (!editable) return;
            e.stopPropagation();
            onSelect();
            setDraft(caption.text);
          }}
          className="min-w-0 rounded-sm text-[13.5px] leading-snug underline decoration-transparent decoration-dotted decoration-2 underline-offset-4 transition-colors duration-200 hover:bg-primary/5 hover:decoration-primary/50"
        >
          {words.map((w, i) => (
            <span
              key={i}
              title={unsure.has(i) ? "Might be misheard" : undefined}
              className={unsure.has(i) ? "underline decoration-amber-500 decoration-wavy underline-offset-[3px]" : undefined}
            >
              {w.text}
              {i < words.length - 1 ? " " : ""}
            </span>
          ))}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete caption"
        disabled={!editable}
        onClick={(e) => {
          e.stopPropagation();
          apply((d) => removeCaption(d, caption.id));
        }}
        className={cn("size-6 opacity-0 transition-opacity duration-200 group-hover:opacity-100", selected && "opacity-100")}
      >
        <Trash2 className="size-3.5" strokeWidth={1.5} />
      </Button>
    </div>
  );
}
