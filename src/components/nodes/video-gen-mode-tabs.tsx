"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type VideoGenMode = "generate" | "edit" | "voice";

type EditTab = {
  disabled: boolean;
  /** Its job is running: a small dot, so it shows from the other tabs too. */
  running: boolean;
};

const TRIGGER = "flex-none px-0.5 pb-1.5 text-sm font-medium text-muted-foreground data-active:text-foreground";

// D492 — what the centre column is for: making a take, editing its picture, or changing its voice.
// Line tabs under the VIDEO heading, beside the take they act on.
export function VideoGenModeTabs({
  mode,
  onModeChange,
  edit,
  voice,
}: {
  mode: VideoGenMode;
  onModeChange: (mode: VideoGenMode) => void;
  edit: EditTab;
  voice: EditTab;
}) {
  return (
    <Tabs value={mode} onValueChange={(v) => onModeChange(v as VideoGenMode)}>
      <TabsList variant="line" className="h-auto gap-6 p-0">
        <TabsTrigger value="generate" className={TRIGGER}>
          Generate
        </TabsTrigger>
        <TabsTrigger value="edit" disabled={edit.disabled} className={TRIGGER}>
          Edit video
          {edit.running && <span className="size-1.5 animate-pulse rounded-full bg-primary" />}
        </TabsTrigger>
        <TabsTrigger value="voice" disabled={voice.disabled} className={TRIGGER}>
          Edit voice
          {voice.running && <span className="size-1.5 animate-pulse rounded-full bg-primary" />}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
