"use client";

import { Aperture, Crop, Sun, type LucideIcon } from "lucide-react";
import {
  SHOT_CONTROLS,
  type ShotControls,
  type ShotControlKey,
} from "@/lib/nodes/shot-controls";

const ICONS: Record<ShotControlKey, LucideIcon> = {
  lens: Aperture,
  composition: Crop,
  lighting: Sun,
};

// Per-shot descriptive controls (lens / composition / lighting). Set values are injected into
// the compiled prompt as constraints the model must honor (PRD §12). "Auto" = no constraint.
export function ShotControlsRow({
  controls,
  onChange,
}: {
  controls: ShotControls;
  onChange: (next: ShotControls) => void;
}) {
  return (
    <div className="space-y-2">
      {SHOT_CONTROLS.map((group) => {
        const Icon = ICONS[group.key];
        return (
          <label key={group.key} className="flex items-center gap-2">
            <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <span className="w-24 shrink-0 text-xs text-muted-foreground">{group.label}</span>
            <select
              value={controls[group.key]}
              onChange={(e) => onChange({ ...controls, [group.key]: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {group.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}
