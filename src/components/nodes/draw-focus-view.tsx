"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft, Eraser, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
        <div className="flex shrink-0 justify-center pt-3">
          <div className="h-1.5 w-12 rounded-full bg-border" />
        </div>

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
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3 px-6 py-4">
            {/* top: New (left, with vertical control rail) | Saved (right) */}
            <div className="flex min-h-0 flex-1 gap-4">
              {/* LEFT — new sketch */}
              <section className="flex min-h-0 flex-1 flex-col">
                <span className="text-eyebrow mb-1.5 block !text-[0.6rem] text-muted-foreground">
                  New
                </span>
                <div className="flex min-h-0 flex-1 gap-2">
                  {/* vertical control rail */}
                  <div className="flex shrink-0 flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-card px-1.5 py-2 shadow-card">
                    {DRAW_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setColor(c);
                          setTool("pen");
                        }}
                        className={cn(
                          "size-6 rounded-full border border-border transition",
                          tool === "pen" &&
                            color === c &&
                            "ring-2 ring-primary ring-offset-1",
                        )}
                        style={{ backgroundColor: c }}
                        aria-label={`Pen ${c}`}
                      />
                    ))}
                    <span className="my-0.5 h-px w-5 bg-border" />
                    <button
                      type="button"
                      onClick={() => setTool("eraser")}
                      className={cn(
                        "inline-flex size-8 items-center justify-center rounded-md transition hover:bg-muted",
                        tool === "eraser" && "ring-2 ring-primary ring-offset-1",
                      )}
                      aria-label="Eraser"
                    >
                      <Eraser className="size-4" strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(true)}
                      className="inline-flex size-8 items-center justify-center rounded-md text-destructive transition hover:bg-muted"
                      aria-label="Clear canvas"
                    >
                      <Trash2 className="size-4" strokeWidth={1.5} />
                    </button>
                    <span className="my-0.5 h-px w-5 bg-border" />
                    <select
                      value={orientation}
                      onChange={(e) =>
                        setOrientation(e.target.value as CanvasOrientation)
                      }
                      className="nodrag w-full rounded-md border border-border bg-card px-1 py-1 text-center text-[0.65rem] font-medium text-foreground transition-colors hover:bg-muted focus:outline-none"
                      aria-label="Aspect ratio"
                      title="Aspect ratio"
                    >
                      {(Object.keys(CANVAS_SIZES) as CanvasOrientation[]).map(
                        (key) => (
                          <option key={key} value={key}>
                            {CANVAS_SIZES[key].label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  {/* drawing canvas */}
                  <div className="flex min-h-0 flex-1 items-center justify-center">
                    <canvas
                      ref={setCanvasRef}
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerLeave={onPointerLeave}
                      className="nodrag rounded-lg border border-border shadow-card"
                      style={{
                        // Scale-to-fit the cell; works for 9:16 / 1:1 / 16:9.
                        maxWidth: "100%",
                        maxHeight: "100%",
                        display: "block",
                        cursor: "crosshair",
                        touchAction: "none",
                      }}
                    />
                  </div>
                </div>
              </section>

              {/* RIGHT — saved sketch (read-only reference) */}
              <section className="flex min-h-0 flex-1 flex-col">
                <span className="text-eyebrow mb-1.5 block !text-[0.6rem] text-muted-foreground">
                  Saved
                </span>
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-border bg-muted/20 p-3">
                  {existingImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={existingImageUrl}
                      alt="Saved sketch"
                      className="max-h-full max-w-full rounded-md border border-border bg-white object-contain"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No saved sketch yet
                    </p>
                  )}
                </div>
              </section>
            </div>

            {/* composition instructions */}
            <div className="w-full shrink-0">
              <label className="text-eyebrow mb-1 block !text-[0.65rem]">
                Composition instructions
              </label>
              <Textarea
                value={localInstr}
                onChange={(e) => setLocalInstr(e.target.value)}
                onBlur={() => onPatch({ instructions: localInstr })}
                placeholder="e.g. wide low-angle hero shot, product centered, warm light…"
                rows={2}
                className="nodrag resize-none"
              />
            </div>
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
