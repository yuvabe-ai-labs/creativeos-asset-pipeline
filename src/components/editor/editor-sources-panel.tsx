"use client";

import { addSourceAgain } from "@/lib/editor/pieces";
import { useEditorStore } from "./editor-store-provider";
import { EditorPanel } from "./editor-panel";
import { EditorSourceRow } from "./editor-source-row";

/** The clips connected to this Editor on the canvas, at their current version (spec §4). */
export function EditorSourcesPanel({ onCollapse }: { onCollapse(): void }) {
  const sources = useEditorStore((s) => s.sources);
  const editable = useEditorStore((s) => s.editable);
  const apply = useEditorStore((s) => s.apply);
  const select = useEditorStore((s) => s.select);

  return (
    <EditorPanel label="Sources" aside={sources.length} side="left" shortcut="Ctrl 1" onCollapse={onCollapse}>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {sources.map((source) => (
          <EditorSourceRow
            key={source.nodeId}
            source={source}
            editable={editable}
            onAdd={() => {
              const id = crypto.randomUUID();
              apply((d) => addSourceAgain(d, source.nodeId, sources, id));
              select({ kind: "piece", id });
            }}
          />
        ))}
      </div>
      <p className="m-0 text-xs leading-relaxed text-muted-foreground">Clips connected to this Editor on the canvas. Press + to add one to the end.</p>
    </EditorPanel>
  );
}
