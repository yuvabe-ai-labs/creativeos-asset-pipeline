"use client";

import { Sun } from "lucide-react";
import { ShotTileStrip } from "./shot-tile-strip";
import {
  LIGHTING_TILES,
  lightingImage,
  lightingTileLabel,
  lightingCaption,
  lightingTooltip,
} from "@/lib/nodes/lighting-preview";

// Visual "show-don't-tell" renderer for the Lighting shot control. Like Composition, each lighting
// mood is a distinct product photo, so every tile shows its own image. Renders through the shared
// ShotTileStrip. Renderer-only — same value/onChange contract as the text-pill controls, so
// compilePrompt output is unchanged.
export function LightingSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ShotTileStrip
      icon={Sun}
      label="Lighting"
      tiles={LIGHTING_TILES}
      value={value}
      onChange={onChange}
      tileLabel={lightingTileLabel}
      tooltip={lightingTooltip}
      caption={lightingCaption}
      mediaSrc={lightingImage}
    />
  );
}
