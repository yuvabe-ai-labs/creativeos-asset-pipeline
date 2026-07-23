"use client";

import { Gauge } from "lucide-react";
import { VIDEO_CONTROLS, type VideoControls } from "@/lib/nodes/video-controls";
import { CameraSelect } from "./camera-select";
import { FieldLabel } from "./field-label";
import { ParamChipGroup } from "./param-chip-group";

const SPEED_OPTIONS = (VIDEO_CONTROLS.find((g) => g.key === "speed")?.options ?? []).map((o) => ({
  value: o.value,
  label: o.label,
}));

// Master video controls (camera move / motion speed) for the Video Prompt node (D24). Camera is a
// visual "show-don't-tell" image grid; Speed is a chip group. Set values are injected into the
// compiled motion prompt as constraints the model must honor — renderer-only, so the prompt is
// unchanged. "Auto" = no constraint.
export function VideoControlsRow({
  controls,
  onChange,
}: {
  controls: VideoControls;
  onChange: (next: VideoControls) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <CameraSelect
        value={controls.camera}
        onChange={(v) => onChange({ ...controls, camera: v })}
      />
      <div className="space-y-2">
        <FieldLabel icon={Gauge} label="Speed" />
        <ParamChipGroup
          options={SPEED_OPTIONS}
          value={controls.speed}
          onValueChange={(v) => onChange({ ...controls, speed: v })}
        />
      </div>
    </div>
  );
}
