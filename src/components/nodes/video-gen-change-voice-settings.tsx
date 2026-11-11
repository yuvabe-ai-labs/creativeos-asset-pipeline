"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { VoiceChangeSettings } from "@/lib/elevenlabs/voice-settings";

type Props = {
  settings: VoiceChangeSettings;
  onSettings: (patch: Partial<VoiceChangeSettings>) => void;
  /** The card's action, under the settings. */
  children?: ReactNode;
};

// D284 — Edit voice's Settings card. D492: only the two choices an operator actually makes are
// offered; stability, similarity and seed keep the node's stored values (the defaults unless set
// before), style is always 0 and the model always Multilingual, as before.
export function VideoGenChangeVoiceSettings({ settings, onSettings, children }: Props) {
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 shadow-card">
      <span className="text-eyebrow">Settings</span>
      <div className="flex items-center justify-between">
        <Label htmlFor="vc-boost" className="text-sm font-normal">Speaker boost</Label>
        <Switch id="vc-boost" checked={settings.speakerBoost} onCheckedChange={(v) => onSettings({ speakerBoost: v })} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="vc-noise" className="text-sm font-normal">Remove background noise</Label>
          <p className="text-xs text-muted-foreground">Also removes music and ambience.</p>
        </div>
        <Switch id="vc-noise" checked={settings.removeBackgroundNoise} onCheckedChange={(v) => onSettings({ removeBackgroundNoise: v })} />
      </div>
      {children}
    </div>
  );
}
