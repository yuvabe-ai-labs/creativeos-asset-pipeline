"use client";

import { Gauge } from "lucide-react";
import { VIDEO_CONTROLS } from "@/lib/nodes/video-controls";
import { FieldLabel } from "./field-label";
import { ParamChipGroup } from "./param-chip-group";

const SPEED_OPTIONS = (VIDEO_CONTROLS.find((g) => g.key === "speed")?.options ?? [])
  // "auto" stays in the data as the no-constraint sentinel (and the stored default),
  // but is no longer offered as a chip.
  .filter((o) => o.value !== "auto")
  .map((o) => ({ value: o.value, label: o.label }));

// Motion-energy control for the Video Prompt node (D24). A single-select chip group laid out as one
// wrapping chip row: the options size to their labels, so the group stays legible when it shares a
// row with Target model instead of clipping into a fixed 4-up grid. Renderer-only — same value/onChange contract as before, so the compiled prompt is
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
      <ParamChipGroup options={SPEED_OPTIONS} value={value} onValueChange={onChange} />
    </div>
  );
}
