"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DubLanguage, DubPace, DubStyle, DubVoiceChoice, DubbingOutput } from "@/lib/dubbing/types";
import { DubbingDubPanel } from "./dubbing-dub-panel";
import { DubbingLipSyncPanel } from "./dubbing-lip-sync-panel";
import { DisabledReason } from "./disabled-reason";
import { LIP_SYNC_NEEDS_DUB } from "@/lib/dubbing/blocked-reasons";

type Tab = "dub" | "lipsync";

type Props = {
  nodeId: string;
  language: DubLanguage;
  onLanguageChange: (l: DubLanguage) => void;
  style: DubStyle;
  onStyleChange: (s: DubStyle) => void;
  voice: DubVoiceChoice;
  onVoiceChange: (v: DubVoiceChoice) => void;
  pace: DubPace;
  onPaceChange: (p: DubPace) => void;
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
  /** D390 — why Dub and Lip sync are off while the node is in the Editor's reel, or null. */
  locked?: string | null;
  onDub: () => void;
  onLipSync: () => void;
};

// D378 — the Dubbing view's controls as two tabs, Dub | Lip sync, so each shows one primary action.
// Opens on Lip sync only when one is running. Lip sync is disabled until there is a dub, and its
// tab says why on hover.
export function DubbingControls({ sourceLoading = false, activeDub, running, onLipSync, locked = null, ...rest }: Props) {
  const [tab, setTab] = useState<Tab>(running === "lipsync" ? "lipsync" : "dub");
  // A dub disappearing (a restore to nothing) falls back to the Dub tab.
  const current: Tab = activeDub ? tab : "dub";
  return (
    <Tabs value={current} onValueChange={(v) => setTab(v as Tab)} className="gap-0">
      <TabsList variant="line" className="w-full justify-start gap-4 border-b border-border px-6 pt-2">
        <TabsTrigger value="dub" className="flex-none px-1 pb-2">Dub</TabsTrigger>
        <DisabledReason reason={activeDub ? null : LIP_SYNC_NEEDS_DUB} className="inline-flex">
          <TabsTrigger value="lipsync" disabled={!activeDub} className="flex-none px-1 pb-2">Lip sync</TabsTrigger>
        </DisabledReason>
      </TabsList>
      <TabsContent value="dub" className="px-6 py-5">
        <DubbingDubPanel
          nodeId={rest.nodeId}
          language={rest.language}
          onLanguageChange={rest.onLanguageChange}
          style={rest.style}
          onStyleChange={rest.onStyleChange}
          voice={rest.voice}
          onVoiceChange={rest.onVoiceChange}
          pace={rest.pace}
          onPaceChange={rest.onPaceChange}
          sourceSeconds={rest.sourceSeconds}
          sourceLoading={sourceLoading}
          hasSource={rest.hasSource}
          hasDub={Boolean(activeDub)}
          running={running}
          editable={rest.editable}
          locked={locked}
          onDub={rest.onDub}
        />
      </TabsContent>
      {activeDub && (
        <TabsContent value="lipsync" className="px-6 py-5">
          <DubbingLipSyncPanel
            activeDub={activeDub}
            activeDubSeconds={rest.activeDubSeconds}
            running={running}
            editable={rest.editable}
            locked={locked}
            onLipSync={onLipSync}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
