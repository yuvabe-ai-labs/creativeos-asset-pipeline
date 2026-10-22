"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAutoCaptionsContext } from "./auto-captions-context";
import { useEditorStore } from "./editor-store-provider";

/** The one Auto captions button (D399). Its cost is on it, so there is no confirmation step. */
export function EditorAutoCaptionsButton({ pieceIds, label = "Auto captions", size = "sm", className }: {
  pieceIds?: string[];
  label?: string;
  size?: "sm" | "default";
  className?: string;
}) {
  const { cost, start, listening } = useAutoCaptionsContext();
  const editable = useEditorStore((s) => s.editable);
  const hasPieces = useEditorStore((s) => s.doc.pieces.length > 0);
  const busy = pieceIds ? pieceIds.some((id) => listening.has(id)) : listening.size > 0;
  const c = cost(pieceIds);
  const why = !editable ? "Someone else is editing this reel." : !hasPieces ? "Add a clip to the timeline first." : busy ? "Listening to the clips…" : undefined;
  return (
    <Button
      variant="outline"
      size={size}
      disabled={Boolean(why)}
      title={why}
      onClick={() => start(pieceIds)}
      className={cn("gap-1.5 border-dashed border-primary/40 text-primary hover:bg-primary/5", className)}
    >
      <Sparkles className="size-3.5" strokeWidth={1.5} />
      {label}
      <span className="font-normal opacity-70">· {c.free ? "free" : `${c.credits} credits`}</span>
    </Button>
  );
}

/** The timeline header's Auto captions, once the reel has captions or a run (spec §9). */
export function EditorTimelineCaptionTools() {
  const has = useEditorStore((s) => s.doc.captions.length > 0);
  const { listening, failed } = useAutoCaptionsContext();
  return has || listening.size > 0 || failed.size > 0 ? <EditorAutoCaptionsButton /> : null;
}
