"use client";

import type { CSSProperties } from "react";
import type { PostFormat, PostLayer } from "@/lib/post/types";
import { POST_FORMATS } from "@/lib/post/formats";
import { getGroupChildren } from "@/lib/post/layers";

type Props = {
  /** The template's own seeded output — already tuned for `format`. */
  layers: PostLayer[];
  format: PostFormat;
};

/**
 * A miniature of what a template will actually produce, built from its real seeded layers.
 *
 * Deliberately plain DOM rather than a Konva stage: a stage per tile would mean fourteen
 * canvases mounted in a scrolling panel, and the preview only has to convey composition —
 * where the copy sits, how much of the frame the scrim takes, which side the CTA is on.
 * Every layer's x/y/w/h is already a 0-1 fraction of the canvas, so it maps straight onto
 * CSS percentages and stays correct at any aspect ratio.
 */
export function PostTemplatePreview({ layers, format }: Props) {
  const spec = POST_FORMATS[format];
  return (
    <div
      className="relative w-full overflow-hidden rounded-sm bg-neutral-200"
      style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
      aria-hidden
    >
      {layers.map((layer) => (
        <PreviewLayer key={layer.id} layer={layer} allLayers={layers} />
      ))}
    </div>
  );
}

function PreviewLayer({ layer, allLayers }: { layer: PostLayer; allLayers: PostLayer[] }) {
  if (layer.hidden) return null;

  const box: CSSProperties = {
    position: "absolute",
    left: `${layer.x * 100}%`,
    top: `${layer.y * 100}%`,
    width: `${layer.w * 100}%`,
    height: `${layer.h * 100}%`,
    opacity: layer.opacity ?? 1,
  };

  // A group has no paint of its own — its children carry it, and they store the same
  // absolute coordinates every other layer does, so they render as siblings here.
  if (layer.kind === "group") {
    return (
      <>
        {getGroupChildren(allLayers, layer).map((child) => (
          <PreviewLayer key={child.id} layer={child} allLayers={allLayers} />
        ))}
      </>
    );
  }

  if (layer.kind === "shape") {
    return (
      <div
        style={{
          ...box,
          background:
            layer.fill.kind === "solid"
              ? layer.fill.color
              // CSS 0deg points up; ours points down, hence the flip (same conversion the
              // gradient preset swatches use).
              : `linear-gradient(${(180 - layer.fill.angle + 360) % 360}deg, ${layer.fill.from}, ${layer.fill.to})`,
          borderRadius: layer.radius >= 999 ? 999 : Math.min(layer.radius / 4, 6),
        }}
      />
    );
  }

  if (layer.kind === "text") {
    // Real glyphs would be sub-pixel at this size. Bars in the text's own colour convey what
    // actually matters — how much space the copy takes and where it sits — and the bar's
    // thickness tracks fontSize so a headline still reads as heavier than body copy.
    return (
      <div style={{ ...box, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
        <span
          style={{
            display: "block",
            width: layer.align === "center" ? "70%" : "100%",
            marginLeft: layer.align === "center" ? "15%" : layer.align === "right" ? "auto" : 0,
            height: Math.max(2, layer.fontSize * 90),
            borderRadius: 1,
            background: layer.color,
          }}
        />
      </div>
    );
  }

  // Image and icon layers: a neutral placeholder block. The connected photo isn't part of a
  // template's seed, so drawing anything more specific would misrepresent it.
  return <div style={{ ...box, background: "rgba(120,120,130,0.35)", borderRadius: 2 }} />;
}
