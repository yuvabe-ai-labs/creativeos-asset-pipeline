"use client";

import { type ShotControls } from "@/lib/nodes/shot-controls";
import { LensSelect } from "./lens-select";
import { CompositionSelect } from "./composition-select";
import { LightingSelect } from "./lighting-select";

// Per-shot descriptive controls (lens / composition / lighting). Set values are injected into the
// compiled prompt as constraints the model must honor (PRD §12); "Auto" = no constraint. Each is a
// visual "show-don't-tell" tile strip (image per option) rather than text pills — renderer-only, so
// the compiled prompt is unchanged.
export function ShotControlsRow({
  controls,
  onChange,
}: {
  controls: ShotControls;
  onChange: (next: ShotControls) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <LensSelect
        value={controls.lens}
        onChange={(v) => onChange({ ...controls, lens: v })}
      />
      <CompositionSelect
        value={controls.composition}
        onChange={(v) => onChange({ ...controls, composition: v })}
      />
      <LightingSelect
        value={controls.lighting}
        onChange={(v) => onChange({ ...controls, lighting: v })}
      />
    </div>
  );
}
