"use client";

import { Aperture, Crop, Sun, type LucideIcon } from "lucide-react";
import {
  SHOT_CONTROLS,
  type ShotControls,
  type ShotControlKey,
} from "@/lib/nodes/shot-controls";
import { ParamChipGroup } from "./param-chip-group";
import { FieldLabel } from "./field-label";

const ICONS: Record<ShotControlKey, LucideIcon> = {
  lens: Aperture,
  composition: Crop,
  lighting: Sun,
};

// Per-shot descriptive controls (lens / composition / lighting). Set values are injected into
// the compiled prompt as constraints the model must honor (PRD §12). "Auto" = no constraint.
// Rendered as horizontal chip groups (like the image-gen output settings), one group per row.
export function ShotControlsRow({
  controls,
  onChange,
}: {
  controls: ShotControls;
  onChange: (next: ShotControls) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {SHOT_CONTROLS.map((group) => (
        <div key={group.key} className="space-y-2">
          <FieldLabel icon={ICONS[group.key]} label={group.label} />
          <ParamChipGroup
            options={group.options.map((o) => ({ value: o.value, label: o.label }))}
            value={controls[group.key]}
            onValueChange={(value) => onChange({ ...controls, [group.key]: value })}
          />
        </div>
      ))}
    </div>
  );
}
