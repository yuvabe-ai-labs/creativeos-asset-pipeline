"use client";

import { Gauge } from "lucide-react";
import { VIDEO_CONTROLS } from "@/lib/nodes/video-controls";
import { FieldLabel } from "./field-label";
import { ParamChipGroup } from "./param-chip-group";

const SPEED_OPTIONS = (VIDEO_CONTROLS.find((g) => g.key === "speed")?.options ?? []).map((o) => ({
  value: o.value,
  label: o.label,
}));

// Motion-energy control for the Video Prompt node (D24). A single-select chip group laid out as one
// equal-width row (grid, not wrap) so the options read as a locked-in segmented control instead of a
// ragged flow. Renderer-only — same value/onChange contract as before, so the compiled prompt is
// unchanged. Sibling of CameraSelect.
export function SpeedSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel icon={Gauge} label="Speed" />
      <ParamChipGroup
        options={SPEED_OPTIONS}
        value={value}
        onValueChange={onChange}
        className="grid grid-cols-4"
      />
    </div>
  );
}
