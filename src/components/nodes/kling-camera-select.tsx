"use client";

import { Video } from "lucide-react";
import { ShotTileStrip } from "./shot-tile-strip";
import { KLING_CAMERA_TILES, klingCameraControl } from "@/lib/video-gen/kling-camera";
import { cameraImage, cameraLabel, cameraTooltip, cameraCaption } from "@/lib/nodes/camera-preview";

// The "Custom" header chip → hand-set the axes in the separate "Fine-tune" group.
const CUSTOM = { value: "custom", label: "Custom", prose: "Hand-set the camera axes in Fine-tune" };

// D77: Kling camera move grid. Writes `camera_move` (mapped to camera_control at request-build
// time). The manual axes live in their own top-level "Fine-tune" group — picking "Custom" here
// pre-fills those axes from the last preset. Reuses the shot ShotTileStrip + camera-preview helpers.
export function KlingCameraSelect({
  params,
  onParamChange,
}: {
  params: Record<string, unknown>;
  onParamChange: (name: string, value: unknown) => void;
}) {
  const move = String(params.camera_move ?? "static");

  function selectMove(next: string) {
    if (next === "custom") {
      // Pre-fill the axes from the previously mapped move so "Custom" starts where the preset left
      // off; the user then nudges them in the Fine-tune group.
      const cfg = klingCameraControl(move)?.config;
      if (cfg) {
        onParamChange("pan", cfg.pan ?? 0);
        onParamChange("tilt", cfg.tilt ?? 0);
        onParamChange("zoom", cfg.zoom ?? 0);
        onParamChange("roll", cfg.roll ?? 0);
        onParamChange("horizontal_movement", cfg.horizontal ?? 0);
        onParamChange("vertical_movement", cfg.vertical ?? 0);
      }
    }
    onParamChange("camera_move", next);
  }

  return (
    <ShotTileStrip
      icon={Video}
      label="Camera"
      tiles={KLING_CAMERA_TILES}
      autoOption={CUSTOM}
      value={move}
      onChange={selectMove}
      tileLabel={cameraLabel}
      tooltip={cameraTooltip}
      caption={cameraCaption}
      mediaSrc={cameraImage}
      columns={4}
    />
  );
}
