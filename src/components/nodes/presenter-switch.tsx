"use client";

import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { useCanvasEditable } from "@/components/canvas/canvas-editable-context";
import { useShotPresenter } from "@/hooks/use-shot-presenter";

// D299 — the presenter in a prompt node's rail: the script's avatar, and whether it is in this
// shot. On by default when the shot has an on-camera line; the operator's choice is stored and
// wins. In the shot, the face goes in as an input — and on Seedance, the voice too.
export function PresenterSwitch({ promptNodeId }: { promptNodeId: string }) {
  const presenter = useShotPresenter(promptNodeId);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const editable = useCanvasEditable();
  const id = useId();
  if (!presenter) return null;
  const { avatar, inShot } = presenter;

  return (
    <div className="mx-2.5 mt-3 flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2">
      {avatar.front ? (
        // eslint-disable-next-line @next/next/no-img-element -- a storage URL, sized by CSS
        <img src={avatar.front.url} alt="" className="size-8 shrink-0 rounded-md object-cover" />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">Presenter: {avatar.name || "Unnamed"}</p>
        <label htmlFor={id} className="text-[0.7rem] text-muted-foreground">In this shot</label>
      </div>
      <Switch
        id={id}
        size="sm"
        checked={inShot}
        disabled={!editable}
        onCheckedChange={(checked) => updateNodeData(promptNodeId, { presenter: { inShot: checked } })}
        aria-label={`${avatar.name || "Presenter"} in this shot`}
      />
    </div>
  );
}
