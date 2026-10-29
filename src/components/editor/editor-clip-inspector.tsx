"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Piece, SourceView } from "@/lib/editor/types";
import { EditorClipCaptionsTab } from "./editor-clip-captions-tab";
import { EditorClipTab } from "./editor-clip-tab";
import { EditorDubTab } from "./editor-dub-tab";
import { useEditorStore } from "./editor-store-provider";
import { useEditorUi, type InspectorTab } from "./editor-ui-context";

/** A selected clip (D405): Clip | Captions | Dub & lip sync. */
export function EditorClipInspector({ piece, source }: { piece: Piece; source: SourceView }) {
  const pieces = useEditorStore((s) => s.doc.pieces);
  const { inspectorTab, setInspectorTab } = useEditorUi();
  const index = pieces.findIndex((p) => p.id === piece.id);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">Clip {index + 1}</span>
        <span className="font-display text-base font-semibold">{source.handle}</span>
      </div>
      <Tabs value={inspectorTab} onValueChange={(v) => setInspectorTab(v as InspectorTab)}>
        <TabsList>
          <TabsTrigger value="clip">Clip</TabsTrigger>
          <TabsTrigger value="captions">Captions</TabsTrigger>
          <TabsTrigger value="dub" className="gap-1.5">
            Dub & lip sync
            {source.files.dubAudio && <span aria-label="dubbed" className="size-1.5 rounded-full bg-emerald-600" />}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="clip" className="pt-3">
          <EditorClipTab piece={piece} source={source} />
        </TabsContent>
        <TabsContent value="captions" className="pt-3">
          <EditorClipCaptionsTab piece={piece} />
        </TabsContent>
        <TabsContent value="dub" className="pt-3">
          <EditorDubTab piece={piece} source={source} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
