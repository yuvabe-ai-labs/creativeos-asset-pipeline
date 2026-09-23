"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUgcBench } from "@/hooks/use-ugc-bench";
import { engineConfig, type Engine } from "@/lib/ugc/constants";
import { ActivityLog } from "./activity-log";
import { FaceRow } from "./face-row";
import { SettingsBar } from "./settings-bar";

export function UgcBench({ engine = "seedance" }: { engine?: Engine }) {
  const bench = useUgcBench(engine);
  return (
    <div className="space-y-4">
      <SettingsBar
        engine={engine}
        settings={bench.settings}
        onChange={bench.setSettings}
        pendingCount={bench.pendingCount}
        onRunAll={bench.runAll}
      />
      <p className="text-xs text-neutral-500">
        {engineConfig(engine).blurb} · session only — nothing is saved and provider links expire.
        Download anything you want to keep.
      </p>
      {bench.rows.map((row) => (
        <FaceRow key={row.id} row={row} bench={bench} />
      ))}
      <Button
        variant="ghost"
        onClick={bench.addRow}
        className="w-full rounded-2xl border border-dashed border-primary/40 py-6 text-primary hover:bg-primary/5"
      >
        <Plus className="size-4" strokeWidth={1.5} />
        Face
      </Button>
      <ActivityLog entries={bench.log} onClear={bench.clearLog} />
    </div>
  );
}
