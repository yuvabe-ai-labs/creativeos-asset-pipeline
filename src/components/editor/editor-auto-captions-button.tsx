"use client";

import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAutoCaptionsContext } from "./auto-captions-context";
import { useEditorStore } from "./editor-store-provider";

/** The one Auto captions button (D399). Its cost is on it, so there is no confirmation step. For
 *  the whole reel it captions only the clips that have none yet, and says so once all have (D410).
 *  Captions made again from a stored transcript cost nothing, so no price is shown. */
export function EditorAutoCaptionsButton({ pieceIds, label = "Auto captions", size = "sm", className }: {
  pieceIds?: string[];
  label?: string;
  size?: "sm" | "default";
  className?: string;
}) {
  const { cost, start, listening, todo } = useAutoCaptionsContext();
  const editable = useEditorStore((s) => s.editable);
  const hasPieces = useEditorStore((s) => s.doc.pieces.length > 0);
  const ids = pieceIds ?? todo;
  const busy = pieceIds ? pieceIds.some((id) => listening.has(id)) : listening.size > 0;
  const allDone = !pieceIds && hasPieces && !busy && todo.length === 0;
  const c = cost(ids);
  const why = !editable ? "Someone else is editing this reel." : !hasPieces ? "Add a clip to the timeline first." : busy ? "Listening to the clips…" : undefined;
  if (allDone) {
    return (
      <Button variant="ghost" size={size} disabled title="Every clip has captions. Redo one from its right-click menu." className={cn("gap-1.5 text-muted-foreground", className)}>
        <Check className="size-3.5" strokeWidth={1.5} />
        All clips captioned
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size={size}
      disabled={Boolean(why)}
      title={why}
      onClick={() => start(ids)}
      className={cn("gap-1.5 border-dashed border-primary/40 text-primary hover:bg-primary/5", className)}
    >
      <Sparkles className="size-3.5" strokeWidth={1.5} />
      {label}
      {c.credits > 0 && <span className="font-normal opacity-70">· {c.credits} credits</span>}
    </Button>
  );
}

/** The timeline header's Auto captions, once the reel has captions or a run (spec §9). */
export function EditorTimelineCaptionTools() {
  const has = useEditorStore((s) => s.doc.captions.length > 0);
  const { listening, failed } = useAutoCaptionsContext();
  return has || listening.size > 0 || failed.size > 0 ? <EditorAutoCaptionsButton /> : null;
}
