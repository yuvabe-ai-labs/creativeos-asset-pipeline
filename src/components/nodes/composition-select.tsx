"use client";

import { Crop } from "lucide-react";
import { ShotTileStrip } from "./shot-tile-strip";
import {
  COMPOSITION_TILES,
  COMPOSITION_AUTO,
  compositionImage,
  compositionTileLabel,
  compositionCaption,
  compositionTooltip,
} from "@/lib/nodes/composition-preview";

// Visual "show-don't-tell" renderer for the Composition shot control. Unlike Lens (one photo,
// computed crop), each framing is a distinct product photo, so every tile shows its own image.
// Renders through the shared ShotTileStrip. Renderer-only — same value/onChange contract as the
// text-pill controls, so compilePrompt output is unchanged.
export function CompositionSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ShotTileStrip
      icon={Crop}
      label="Composition"
      tiles={COMPOSITION_TILES}
      autoOption={COMPOSITION_AUTO}
      value={value}
      onChange={onChange}
      tileLabel={compositionTileLabel}
      tooltip={compositionTooltip}
      caption={compositionCaption}
      mediaSrc={compositionImage}
    />
  );
}
