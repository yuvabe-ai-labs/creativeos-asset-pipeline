"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { NodeTrace } from "@/lib/eval/node-traces";
import { ActionList } from "./action-list";
import { TraceDetail } from "./trace-detail";
import { setVersionLabelAction } from "@/lib/actions/eval";

type Decision = "pass" | "fail" | null;

// Index of a node's active version within its (newest→oldest) versions list.
function activeIx(t: NodeTrace | undefined): number {
  if (!t) return 0;
  const ix = t.versions.findIndex((v) => v.versionId === t.activeVersionId);
  return ix >= 0 ? ix : 0;
}

// The error-analysis workbench: list of generated nodes (grouped by action) + a
// detail pane for the selected node, walkable across its versions. Open coding
// writes decision/note optimistically (spec §4.1/§6).
export function EvalWorkbench({ traces: initial }: { traces: NodeTrace[] }) {
  const [traces, setTraces] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.nodeId ?? null);
  const [versionIx, setVersionIx] = useState(() => activeIx(initial[0]));

  const trace = traces.find((t) => t.nodeId === selectedId) ?? traces[0] ?? null;

  function selectNode(id: string) {
    setSelectedId(id);
    setVersionIx(activeIx(traces.find((t) => t.nodeId === id)));
  }

  async function onLabel(versionId: string, decision: Decision, note: string) {
    setTraces((prev) => prev.map((t) => ({
      ...t,
      versions: t.versions.map((v) => (v.versionId === versionId ? { ...v, decision, note: note || null } : v)),
    })));
    try {
      await setVersionLabelAction(versionId, { decision, note: note.trim() || null });
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    }
  }

  return (
    <div className="flex h-screen">
      <aside className="w-[300px] shrink-0 overflow-y-auto border-r border-border bg-background">
        <ActionList traces={traces} selectedId={selectedId} onSelect={selectNode} />
      </aside>
      <main className="min-h-0 flex-1 overflow-y-auto bg-neutral-50">
        <div className="mx-auto max-w-4xl px-8 py-6">
          {trace && (
            <>
              <h1 className="mb-4 font-display text-2xl font-semibold tracking-tight">{trace.title}</h1>
              <TraceDetail trace={trace} versionIx={versionIx} onStep={setVersionIx} onLabel={onLabel} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
