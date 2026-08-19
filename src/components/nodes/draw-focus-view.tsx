"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft, Eraser, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { DrawNodeData } from "@/lib/canvas-nodes";
import { fileNodeService } from "@/services/file-node.service";
import {
  useDrawingCanvas,
  DRAW_COLORS,
  initDrawingCanvas,
  CANVAS_SIZES,
  type CanvasOrientation,
} from "./use-drawing-canvas";
import { EditableField } from "./editable-field";

type DrawFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  instructions?: string;
  existingImageUrl?: string; // the sketch already saved on this node, shown as a reference
  onPatch: (patch: Partial<DrawNodeData>) => void;
};

export function DrawFocusView({
  open,
  onOpenChange,
  nodeId,
  title,
  instructions,
  existingImageUrl,
  onPatch,
}: DrawFocusViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [orientation, setOrientation] = useState<CanvasOrientation>("portrait");
  const { w, h } = CANVAS_SIZES[orientation];
  // Callback ref: init the buffer exactly when the canvas attaches (the Sheet portals/
  // unmounts its content). Re-created when w/h change, so picking a new aspect ratio
  // re-inits the canvas at the new size (on a fresh white sheet).
  const setCanvasRef = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef.current = el;
      if (el) initDrawingCanvas(el, w, h);
    },
    [w, h],
  );
  const {
    tool,
    setTool,
    color,
    setColor,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    clear,
    toBlob,
  } = useDrawingCanvas(canvasRef);
  const [saving, setSaving] = useState(false);
  const [localInstr, setLocalInstr] = useState(instructions ?? "");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const blob = await toBlob();
      if (!blob) throw new Error("Nothing to save yet");
      const file = new File([blob], `sketch-${Date.now()}.png`, {
        type: "image/png",
      });
      const result = await fileNodeService.upload(nodeId, file);
      onPatch({
        fileUrl: result.fileUrl,
        fileKind: "image",
        filename: result.filename,
        instructions: localInstr,
      });
      toast.success("Sketch saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-5xl px-6 pb-5 pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-auto gap-1.5 border-0 p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Back to canvas
            </Button>

            <header className="mt-4 flex items-start justify-between gap-4">
              <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                <EditableField
                  value={title || ""}
                  onCommit={(t) => onPatch({ title: t })}
                  placeholder="Untitled sketch"
                  className="font-display text-3xl font-semibold tracking-tight"
                />
              </SheetTitle>
              <Button
                size="lg"
                onClick={() =>
                  existingImageUrl ? setConfirmSave(true) : handleSave()
                }
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </header>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="mx-auto flex h-full w-full max-w-6xl gap-5 px-6 py-4">
            {/* HERO — the new drawing: canvas + controls + instructions, one section.
                The canvas is the only element with a shadow so it reads as the centre piece. */}
            <div className="flex min-h-0 flex-1 flex-col items-center gap-3">
              <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                <canvas
                  ref={setCanvasRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerLeave}
                  className="nodrag rounded-lg border border-border shadow-card"
                  style={{
                    // Scale-to-fit; works for 9:16 / 1:1 / 16:9.
                    maxWidth: "100%",
                    maxHeight: "100%",
                    display: "block",
                    cursor: "crosshair",
                    touchAction: "none",
                  }}
                />
              </div>

              {/* controls — flat (no shadow), so the canvas stays the focus */}
              <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
                {DRAW_COLORS.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setColor(c);
                      setTool("pen");
                    }}
                    className={cn(
                      "size-6 rounded-full border-border p-0 transition",
                      tool === "pen" &&
                        color === c &&
                        "ring-2 ring-primary ring-offset-1",
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Pen ${c}`}
                  />
                ))}
                <span className="mx-1 h-5 w-px bg-border" />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setTool("eraser")}
                  className={cn(
                    "size-8 rounded-md p-0 transition hover:bg-muted",
                    tool === "eraser" && "ring-2 ring-primary ring-offset-1",
                  )}
                  aria-label="Eraser"
                >
                  <Eraser className="size-4" strokeWidth={1.5} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmClear(true)}
                  className="size-8 rounded-md p-0 text-destructive transition hover:bg-muted hover:text-destructive"
                  aria-label="Clear canvas"
                >
                  <Trash2 className="size-4" strokeWidth={1.5} />
                </Button>
                <span className="mx-1 h-5 w-px bg-border" />
                <Select
                  value={orientation}
                  onValueChange={(value) =>
                    setOrientation(value as CanvasOrientation)
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="nodrag text-xs font-medium"
                    aria-label="Aspect ratio"
                    title="Aspect ratio"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CANVAS_SIZES) as CanvasOrientation[]).map(
                      (key) => (
                        <SelectItem key={key} value={key} className="text-xs">
                          {CANVAS_SIZES[key].label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* composition instructions — bg tint for emphasis, no shadow */}
              <div className="w-full max-w-2xl shrink-0">
                <label className="text-eyebrow mb-1 block !text-[0.65rem]">
                  Composition instructions
                </label>
                <Textarea
                  value={localInstr}
                  onChange={(e) => setLocalInstr(e.target.value)}
                  onBlur={() => onPatch({ instructions: localInstr })}
                  placeholder="e.g. wide low-angle hero shot, product centered, warm light…"
                  rows={2}
                  className="nodrag resize-none border-border bg-muted/50"
                />
              </div>
            </div>

            {/* SAVED — secondary reference, just a big thumbnail */}
            <aside className="flex w-44 shrink-0 flex-col gap-1.5">
              <span className="text-eyebrow block !text-[0.6rem] text-muted-foreground">
                Saved
              </span>
              {existingImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={existingImageUrl}
                  alt="Saved sketch"
                  className="w-full rounded-lg border border-border bg-white"
                />
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No saved sketch yet
                </div>
              )}
            </aside>
          </div>
        </div>
      </SheetContent>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the canvas?</AlertDialogTitle>
            <AlertDialogDescription>
              This erases the current drawing and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clear();
                setConfirmClear(false);
              }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSave} onOpenChange={setConfirmSave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite saved sketch?</AlertDialogTitle>
            <AlertDialogDescription>
              Saving replaces the sketch currently saved on this node. This can&apos;t
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmSave(false);
                handleSave();
              }}
            >
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
