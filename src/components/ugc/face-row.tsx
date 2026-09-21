"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FaceRow as Row } from "@/lib/ugc/board";
import type { UgcBench } from "@/hooks/use-ugc-bench";
import { FaceColumn } from "./face-column";
import { ScriptTile } from "./script-tile";

export function FaceRow({ row, bench }: { row: Row; bench: UgcBench }) {
  return (
    <div className="flex gap-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-card p-4 shadow-card">
      <FaceColumn
        row={row}
        onPrompt={(t) => bench.setFacePrompt(row.id, t)}
        onGenerate={() => bench.generateFace(row.id)}
        onRegenerate={() => bench.regenerateFace(row.id)}
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-center">
          <span className="text-eyebrow">2 · Seedance scripts → videos</span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            onClick={() => bench.removeRow(row.id)}
            aria-label="Remove face row"
          >
            <Trash2 className="size-3.5" strokeWidth={1.5} />
          </Button>
        </div>
        <div className="flex items-stretch gap-3">
          {row.tiles.map((t) => (
            <ScriptTile
              key={t.id}
              tile={t}
              canRun={row.faceStatus === "ready"}
              onScript={(s) => bench.setScript(row.id, t.id, s)}
              onRun={() => bench.runTile(row.id, t.id)}
              onRemove={() => bench.removeTile(row.id, t.id)}
            />
          ))}
          <Button
            variant="ghost"
            onClick={() => bench.addTile(row.id)}
            className="h-auto w-24 shrink-0 flex-col rounded-xl border border-dashed border-primary/40 text-primary hover:bg-primary/5"
          >
            <Plus className="size-4" strokeWidth={1.5} />
            Script
          </Button>
        </div>
      </div>
    </div>
  );
}
