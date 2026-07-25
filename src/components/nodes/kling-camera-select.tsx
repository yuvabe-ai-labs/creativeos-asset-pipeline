"use client";

import { SlidersHorizontal, Video } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ShotTileStrip } from "./shot-tile-strip";
import { ImageGenParamRow } from "./image-gen-param-row";
import { ParamControl } from "./param-controls";
import { KLING_CAMERA_TILES, klingCameraControl } from "@/lib/video-gen/kling-camera";
import { cameraImage, cameraLabel, cameraTooltip, cameraCaption } from "@/lib/nodes/camera-preview";
import type { ParamSpec } from "@/lib/image-gen/types";

// The "Custom" header chip → hand-set the axis sliders (camera_move = "custom").
const CUSTOM = { value: "custom", label: "Custom", prose: "Hand-set the camera axes" };

// D77: Kling camera. The visual grid writes `camera_move` (mapped to camera_control at
// request-build time); the Fine-tune expander edits the raw axes. Reuses the shot ShotTileStrip
// and the camera-preview label/image helpers — same vocabulary as the Video Prompt node's grid.
export function KlingCameraSelect({
  params,
  axisSpecs,
  onParamChange,
}: {
  params: Record<string, unknown>;
  axisSpecs: ParamSpec[]; // the 6 axis specs, for the Fine-tune sliders
  onParamChange: (name: string, value: unknown) => void;
}) {
  const move = String(params.camera_move ?? "static");

  function selectMove(next: string) {
    if (next === "custom") {
      // Pre-fill the axes from the previously mapped move so "custom" starts where the preset
      // left off, then the user nudges from there.
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
    <div className="space-y-3">
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
      <Accordion multiple={false} className="pt-0">
        <AccordionItem value="fine" className="border-none">
          <AccordionTrigger className="py-1 hover:no-underline">
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal className="size-3.5 text-primary" strokeWidth={1.5} />
              <span className="text-eyebrow">Fine-tune</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            <div className="flex flex-col gap-4">
              {axisSpecs.map((spec) => (
                <ImageGenParamRow key={spec.name} icon={Video} label={spec.label}>
                  <ParamControl
                    spec={spec}
                    value={params[spec.name] ?? spec.defaultValue}
                    onChange={(v) => {
                      onParamChange(spec.name, v);
                      onParamChange("camera_move", "custom"); // any manual axis edit = custom mode
                    }}
                  />
                </ImageGenParamRow>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
