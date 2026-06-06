"use client";

import { useState, type ChangeEvent } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ReelOutput } from "./reel-output";
import {
  KB_PARSE_SLICES,
  DEFAULT_PARSE_SLICES,
  type KBSliceKey,
} from "@/lib/kb/parse-context";

// Script node. Input = a finished reel script (the designer already has it).
// Compact on the canvas; the real editing happens in a side panel (Sheet).
// "Parse" EXTRACTS the script's structure into the reel object (no invention).
export function ScriptNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const d = data as {
    title?: string;
    source?: string;
    parsed?: unknown;
    kbSlices?: KBSliceKey[];
  };
  const title = d.title ?? "";
  const source = d.source ?? "";
  const parsed = d.parsed;
  const selectedSlices = d.kbSlices ?? DEFAULT_PARSE_SLICES;

  function toggleSlice(key: KBSliceKey) {
    const next = selectedSlices.includes(key)
      ? selectedSlices.filter((k) => k !== key)
      : [...selectedSlices, key];
    updateNodeData(id, { kbSlices: next });
  }
  const [open, setOpen] = useState(false);
  const [parsing, setParsing] = useState(false);

  async function handleParse() {
    if (!source.trim()) {
      toast.error("Add a script to extract");
      return;
    }
    setParsing(true);
    try {
      const res = await fetch(`/api/nodes/${id}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, slices: selectedSlices }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "Node is still saving — wait a second and retry."
            : (json.error ?? "Extraction failed"),
        );
      }
      updateNodeData(id, { parsed: json.output }); // cache + persist via autosave
      toast.success("Script extracted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setParsing(false);
    }
  }

  function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      updateNodeData(id, {
        source: typeof reader.result === "string" ? reader.result : "",
      });
    reader.readAsText(file);
  }

  return (
    <div
      className={cn(
        "w-44 rounded-lg border border-border bg-card shadow-card",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5">
          <FileText className="size-3.5 text-primary" />
          <span className="text-eyebrow !text-[0.65rem]">Script</span>
        </div>
        <span
          className={cn(
            "size-1.5 rounded-full",
            parsed ? "bg-primary" : "bg-muted-foreground/40",
          )}
          title={parsed ? "Extracted" : "Not extracted"}
        />
      </div>

      <div className="px-3 py-3">
        <p className="truncate font-display text-sm font-medium">
          {title || (
            <span className="text-muted-foreground">Untitled script</span>
          )}
        </p>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <button className="nodrag -mx-1.5 mt-3 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10">
                Open ↗
              </button>
            }
          />
          <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
            <SheetHeader className="border-b p-5">
              <SheetTitle className="font-display text-xl">Reel script</SheetTitle>
              <SheetDescription>
                Paste or upload a finished reel script, then extract its structure.
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="grid gap-2">
                <Label htmlFor={`title-${id}`}>Title</Label>
                <Input
                  id={`title-${id}`}
                  value={title}
                  placeholder="Untitled script"
                  onChange={(e) => updateNodeData(id, { title: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`source-${id}`}>Reel script</Label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                    <Upload className="size-3.5" /> Upload .md/.txt
                    <input
                      type="file"
                      accept=".md,.txt,text/plain,text/markdown"
                      className="hidden"
                      onChange={handleUpload}
                    />
                  </label>
                </div>
                <Textarea
                  id={`source-${id}`}
                  value={source}
                  rows={10}
                  placeholder="Paste the reel script here…"
                  onChange={(e) => updateNodeData(id, { source: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label>Brand context</Label>
                <div className="flex flex-wrap gap-1.5">
                  {KB_PARSE_SLICES.map((s) => {
                    const active = selectedSlices.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => toggleSlice(s.key)}
                        className={cn(
                          "nodrag rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-1.5">
                <Button onClick={handleParse} disabled={parsing || !source.trim()}>
                  {parsing ? "Extracting…" : "Extract"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Injects the selected brand context into extraction.
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Extracted reel</Label>
                {parsed ? (
                  <ReelOutput data={parsed as Record<string, unknown>} />
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Not extracted yet.
                  </p>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!size-2 !border-2 !border-card !bg-muted-foreground"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-2 !border-card !bg-primary"
      />
    </div>
  );
}
