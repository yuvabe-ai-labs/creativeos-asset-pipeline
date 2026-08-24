"use client";

import { Video } from "lucide-react";
import { ShotTileStrip } from "./shot-tile-strip";
import {
  CAMERA_TILES,
  cameraLabel,
  cameraTooltip,
  cameraCaption,
} from "@/lib/nodes/camera-preview";
import { CameraMotionPreview } from "./camera-motion-preview";

// Visual "show-don't-tell" renderer for the Video Prompt's Camera control. Each camera move is an
// animated 3D scene (CameraMotionPreview) laid out as a 3×3 grid via the shared ShotTileStrip.
// Replaces the old clip posters, which were stock photos unrelated to the move and existed for
// only 6 of the 9 options — the other three fell back to a bare placeholder glyph.
// Renderer-only: same value/onChange contract as before, so the compiled motion prompt is
// unchanged. Spec: docs/superpowers/specs/2026-07-23-camera-control-visual-selectors-design.md.
export function CameraSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ShotTileStrip
      icon={Video}
      label="Camera"
      tiles={CAMERA_TILES}
      value={value}
      onChange={onChange}
      tileLabel={cameraLabel}
      tooltip={cameraTooltip}
      caption={cameraCaption}
      renderMedia={(v) => <CameraMotionPreview value={v} />}
      columns={3}
      compact
    />
  );
}
