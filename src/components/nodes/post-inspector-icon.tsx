"use client";

import type { IconLayer } from "@/lib/post/types";
import { resolveIconSource } from "@/lib/post/icons";
import { PostColourSwatches } from "./post-colour-swatches";

type Props = {
  layer: IconLayer;
  onChange: (patch: Partial<IconLayer>) => void;
  /** Live update while a colour is dragged in the OS picker; onChange lands the undo entry. */
  onPreview: (patch: Partial<IconLayer>) => void;
};

export function PostInspectorIcon({ layer, onChange, onPreview }: Props) {
  if (layer.src.kind === "url") {
    return (
      <p className="text-xs text-muted-foreground">
        Uploaded icon — its colours come from the file itself.
      </p>
    );
  }

  // A brand mark has one correct colour, so its own hex — not the generic near-black every
  // other icon defaults to — is the useful starting point for the swatch.
  const resolved = resolveIconSource(layer.src);
  const seed = resolved.kind === "simple" ? `#${resolved.value.hex}` : "#1e1e1e";

  return (
    // Swatches rather than the bare OS colour input this used to be: the palette covers
    // ordinary work in one click, and the custom picker previews instead of landing one undo
    // entry per pointer sample (D125).
    <PostColourSwatches
      label="Colour"
      value={layer.color ?? seed}
      onChange={(color) => onChange({ color })}
      onPreview={(color) => onPreview({ color })}
    />
  );
}
