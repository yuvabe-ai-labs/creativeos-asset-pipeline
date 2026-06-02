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

// Brief node (1E). Compact on the canvas; the real editing happens in a side
// panel (Sheet). Source text lives in node.data (persisted by the canvas
// autosave). Parse + version history are wired in the next steps.
export function BriefNode({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const d = data as { title?: string; source?: string; parsed?: unknown };
  const title = d.title ?? "";
  const source = d.source ?? "";
  const parsed = d.parsed;
  const [open, setOpen] = useState(false);
  const [parsing, setParsing] = useState(false);

  async function handleParse() {
    if (!source.trim()) {
      toast.error("Add a brief to parse");
      return;
    }
    setParsing(true);
    try {
      const res = await fetch(`/api/nodes/${id}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "Node is still saving — wait a second and retry."
            : (json.error ?? "Parse failed"),
        );
      }
      updateNodeData(id, { parsed: json.output }); // cache + persist via autosave
      toast.success("Brief parsed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Parse failed");
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
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <FileText className="size-3 text-primary" />
          <span className="text-eyebrow !text-[0.6rem]">Brief</span>
        </div>
        <span
          className={cn(
            "size-1.5 rounded-full",
            parsed ? "bg-primary" : "bg-muted-foreground/40",
          )}
          title={parsed ? "Parsed" : "Not parsed"}
        />
      </div>

      <div className="px-2 py-2">
        <p className="truncate font-display text-xs font-medium">
          {title || <span className="text-muted-foreground">Untitled brief</span>}
        </p>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <button className="nodrag mt-1.5 text-[0.65rem] font-medium text-primary hover:underline">
                Open ↗
              </button>
            }
          />
          <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
            <SheetHeader className="border-b p-5">
              <SheetTitle className="font-display text-xl">Brief</SheetTitle>
              <SheetDescription>
                Paste or upload a brief, then parse it into structured context.
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="grid gap-2">
                <Label htmlFor={`title-${id}`}>Title</Label>
                <Input
                  id={`title-${id}`}
                  value={title}
                  placeholder="Untitled brief"
                  onChange={(e) => updateNodeData(id, { title: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`source-${id}`}>Source brief</Label>
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
                  placeholder="Paste the brief here…"
                  onChange={(e) => updateNodeData(id, { source: e.target.value })}
                />
              </div>

              <div className="grid gap-1.5">
                <Button
                  onClick={handleParse}
                  disabled={parsing || !source.trim()}
                >
                  {parsing ? "Parsing…" : "Parse"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Extracts structured fields from the brief (uses the client&apos;s
                  context notes).
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Parsed output</Label>
                {parsed ? (
                  <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs">
                    {JSON.stringify(parsed, null, 2)}
                  </pre>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Not parsed yet.
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
