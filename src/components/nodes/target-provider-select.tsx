"use client";

import { Cpu } from "lucide-react";
import { FieldLabel } from "./field-label";
import { ParamChipGroup } from "./param-chip-group";
import type { VideoProvider } from "@/prompts/video-prompt-generate";

const OPTIONS: { value: VideoProvider; label: string }[] = [
  { value: "veo", label: "Veo" },
  { value: "kling", label: "Kling" },
];

// D77: which video model family this motion prompt is written for. Locks to a connected
// Video Gen node's provider when present (single source of truth); editable otherwise.
export function TargetProviderSelect({
  value,
  onChange,
  lockedLabel,
}: {
  value: VideoProvider;
  onChange: (value: VideoProvider) => void;
  lockedLabel?: string; // set → disabled, shows the reason (e.g. "set by connected video node")
}) {
  return (
    <div className="space-y-2">
      <FieldLabel icon={Cpu} label="Target model" />
      <ParamChipGroup
        options={OPTIONS}
        value={value}
        onValueChange={(v) => onChange(v as VideoProvider)}
        disabled={Boolean(lockedLabel)}
      />
      {lockedLabel && <p className="text-xs text-muted-foreground">{lockedLabel}</p>}
    </div>
  );
}
