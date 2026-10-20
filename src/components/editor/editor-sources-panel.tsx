"use client";

import { addSourceAgain } from "@/lib/editor/pieces";
import { useEditorStore } from "./editor-store-provider";
import { EditorPanel } from "./editor-panel";
import { EditorSourceRow } from "./editor-source-row";

const TONES = ["bg-muted", "bg-accent", "bg-secondary"];

/** The clips connected to this Editor on the canvas, at their current version (spec §6). */
export function EditorSourcesPanel() {
  const sources = useEditorStore((s) => s.sources);
  const editable = useEditorStore((s) => s.editable);
  const apply = useEditorStore((s) => s.apply);
  const select = useEditorStore((s) => s.select);

  return (
    <EditorPanel label="Sources" aside={`${sources.length} connected`}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {sources.map((source, i) => (
          <EditorSourceRow
            key={source.nodeId}
            source={source}
            tone={TONES[i % TONES.length]}
            editable={editable}
            onAdd={() => {
              const id = crypto.randomUUID();
              apply((d) => addSourceAgain(d, source.nodeId, sources, id));
              select({ kind: "piece", id });
            }}
          />
        ))}
      </div>
      <p className="m-0 text-xs leading-relaxed text-muted-foreground">Sources are the clips connected to this Editor on the canvas.</p>
    </EditorPanel>
  );
}
