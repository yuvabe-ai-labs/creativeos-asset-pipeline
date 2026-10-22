"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditorCaptionsStyle } from "./editor-captions-style";
import { EditorCaptionsText } from "./editor-captions-text";
import { useEditorStore } from "./editor-store-provider";

export type CaptionsTab = "text" | "style";

/** Captions as one layer (D396), as ElevenLabs Studio and Descript show them: Text lists every
 *  line, Style sets the reel's look. */
export function EditorCaptionsPanel({ tab, onTab }: { tab: CaptionsTab; onTab(t: CaptionsTab): void }) {
  const count = useEditorStore((s) => s.doc.captions.length);
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 font-display text-[15px] font-semibold">Captions</h2>
        <span className="text-xs text-muted-foreground">{count ? `${count} line${count === 1 ? "" : "s"}` : "None yet"}</span>
      </div>
      <Tabs value={tab} onValueChange={(v) => onTab(v as CaptionsTab)}>
        <TabsList>
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="style">Style</TabsTrigger>
        </TabsList>
        <TabsContent value="text" className="pt-3">
          <EditorCaptionsText />
        </TabsContent>
        <TabsContent value="style" className="pt-3">
          <EditorCaptionsStyle />
        </TabsContent>
      </Tabs>
    </div>
  );
}
