"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DubLanguage, DubStyle, DubbingOutput } from "@/lib/dubbing/types";
import { DubbingDubPanel } from "./dubbing-dub-panel";
import { DubbingLipSyncPanel } from "./dubbing-lip-sync-panel";

type Tab = "dub" | "lipsync";

type Props = {
  language: DubLanguage;
  onLanguageChange: (l: DubLanguage) => void;
  style: DubStyle;
  onStyleChange: (s: DubStyle) => void;
  /** The connected take's length; 0 when unknown. */
  sourceSeconds: number;
  /** The connected take is still being read, so its length is not known yet. */
  sourceLoading?: boolean;
  /** The active dub's own length, which Lip sync bills; 0 when unknown. */
  activeDubSeconds: number;
  hasSource: boolean;
  activeDub: DubbingOutput | null;
  running: "dub" | "lipsync" | null;
  editable: boolean;
  onDub: () => void;
  onLipSync: () => void;
};

// D378 — the Dubbing view's controls as two tabs, Dub | Lip sync, so each shows one primary action.
// Opens on Lip sync only when one is running; a "Ready" mark on its tab says a dub is waiting for it.
export function DubbingControls({ sourceLoading = false, activeDub, running, onLipSync, ...rest }: Props) {
  const [tab, setTab] = useState<Tab>(running === "lipsync" ? "lipsync" : "dub");
  const lipSyncReady = Boolean(activeDub && !activeDub.lipSynced) && running === null && tab === "dub";
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-0">
      <TabsList variant="line" className="w-full justify-start gap-4 border-b border-border px-6 pt-2">
        <TabsTrigger value="dub" className="flex-none px-1 pb-2">Dub</TabsTrigger>
        <TabsTrigger value="lipsync" className="flex-none px-1 pb-2">
          Lip sync
          {lipSyncReady && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-primary">Ready</span>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="dub" className="px-6 py-5">
        <DubbingDubPanel
          language={rest.language}
          onLanguageChange={rest.onLanguageChange}
          style={rest.style}
          onStyleChange={rest.onStyleChange}
          sourceSeconds={rest.sourceSeconds}
          sourceLoading={sourceLoading}
          hasSource={rest.hasSource}
          hasDub={Boolean(activeDub)}
          running={running}
          editable={rest.editable}
          onDub={rest.onDub}
        />
      </TabsContent>
      <TabsContent value="lipsync" className="px-6 py-5">
        <DubbingLipSyncPanel
          activeDub={activeDub}
          activeDubSeconds={rest.activeDubSeconds}
          running={running}
          editable={rest.editable}
          onLipSync={onLipSync}
          onGoToDub={() => setTab("dub")}
        />
      </TabsContent>
    </Tabs>
  );
}
