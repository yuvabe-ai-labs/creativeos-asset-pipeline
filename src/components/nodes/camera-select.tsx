"use client";

import { Video } from "lucide-react";
import { ShotTileStrip } from "./shot-tile-strip";
import {
  CAMERA_TILES,
  CAMERA_AUTO,
  cameraImage,
  cameraLabel,
  cameraTooltip,
  cameraCaption,
} from "@/lib/nodes/camera-preview";

// Visual "show-don't-tell" renderer for the Video Prompt's Camera control. Each camera move is a
// clip poster (or a placeholder for moves with no art), laid out as a 3×3 grid via the shared
// ShotTileStrip. Renderer-only — same value/onChange contract as the old dropdown, so the compiled
// motion prompt is unchanged. Spec: docs/superpowers/specs/2026-07-23-camera-control-visual-selectors-design.md.
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
      autoOption={CAMERA_AUTO}
      value={value}
      onChange={onChange}
      tileLabel={cameraLabel}
      tooltip={cameraTooltip}
      caption={cameraCaption}
      mediaSrc={cameraImage}
      columns={3}
      compact
    />
  );
}
