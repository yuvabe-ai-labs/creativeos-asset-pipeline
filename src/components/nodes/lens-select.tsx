"use client";

import { Aperture } from "lucide-react";
import { ShotTileStrip } from "./shot-tile-strip";
import {
  LENS_TILES,
  LENS_AUTO,
  LENS_PREVIEW_SRC,
  lensZoom,
  lensTileLabel,
  lensCaption,
  lensTooltip,
} from "@/lib/nodes/lens-preview";

// Visual "show-don't-tell" renderer for the Lens shot control: one demo photo cropped progressively
// tighter across five focal-length tiles (zoom = focal / 24mm). Renders through the shared
// ShotTileStrip — Lens' one distinguishing trait is that all tiles share one image, scaled per tile.
// Spec: docs/superpowers/specs/2026-07-21-visual-lens-selector-design.md.
export function LensSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ShotTileStrip
      icon={Aperture}
      label="Lens"
      tiles={LENS_TILES}
      autoOption={LENS_AUTO}
      value={value}
      onChange={onChange}
      tileLabel={lensTileLabel}
      tooltip={lensTooltip}
      caption={lensCaption}
      mediaSrc={() => LENS_PREVIEW_SRC}
      mediaStyle={(v) => ({ transform: `scale(${lensZoom(v)})` })}
    />
  );
}
