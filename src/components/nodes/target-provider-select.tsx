"use client";

import { Cpu } from "lucide-react";
import { FieldLabel } from "./field-label";
import { ParamChipGroup } from "./param-chip-group";
import type { VideoProvider } from "@/prompts/video-prompt-generate";

// Every member of VideoProvider must appear here. The chips match on value, so a provider missing
// from this list renders the field with NOTHING selected — and because a connected Video Gen node
// locks the control, the operator cannot correct it. That is what happened when `provider` gained
// "gemini" and providerOf cast it away; it recurs the moment a fourth model family is added.
const OPTIONS: { value: VideoProvider; label: string }[] = [
  { value: "veo", label: "Veo" },
  { value: "kling", label: "Kling" },
  { value: "gemini-omni", label: "Omni" },
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
    // The lock reason rides on `title` instead of a caption line: as a paragraph it
    // was both visual noise and — being wider than the two chips above it — the thing
    // forcing this column wide enough to wrap Speed onto a second row beside it.
    <div className="space-y-2" title={lockedLabel}>
      <FieldLabel icon={Cpu} label="Target model" />
      <ParamChipGroup
        options={OPTIONS}
        value={value}
        onValueChange={(v) => onChange(v as VideoProvider)}
        disabled={Boolean(lockedLabel)}
      />
    </div>
  );
}
