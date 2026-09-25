"use client";

import { AudioLines } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// D284 — the preview header's switch between the player and the Change voice workspace.
export function VideoGenChangeVoiceToggle({ checked, disabled, onCheckedChange }: { checked: boolean; disabled: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <AudioLines className="size-3.5 text-primary" strokeWidth={1.5} />
      <Label htmlFor="change-voice-toggle" className="text-xs font-medium">Change voice</Label>
      <Switch id="change-voice-toggle" checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
