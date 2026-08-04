// src/components/nodes/post-focus-view.tsx
// MINIMAL placeholder — replaced with the full editor shell in Task 20.
"use client";

import { ArrowLeft } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EditableField } from "./editable-field";
import type { PostNodeData } from "@/lib/canvas-nodes";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  onPatch: (patch: Partial<PostNodeData>) => void;
};

export function PostFocusView({ open, onOpenChange, title, onPatch }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-5xl px-6 pb-5 pt-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Back to canvas
            </button>
            <header className="mt-4 flex items-start justify-between gap-4">
              <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                <EditableField
                  value={title || ""}
                  onCommit={(t) => onPatch({ title: t })}
                  placeholder="Untitled post"
                  className="font-display text-3xl font-semibold tracking-tight"
                />
              </SheetTitle>
            </header>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          Editor coming in Task 20.
        </div>
      </SheetContent>
    </Sheet>
  );
}
