import type { PostFormat, PostLayer } from "../types";
import type { CopyZone } from "../copy-zone-hint";
import * as lowerThird from "./lower-third";
import * as insetCard from "./inset-card";
import * as minimalFrame from "./minimal-frame";
import * as numberedTips from "./numbered-tips";

/**
 * Where a template wants the post's connected photo to sit.
 *
 * Without this, applying a template left the photo wherever it already was — usually
 * full-bleed underneath — so a layout designed around an inset plate or a half-frame image
 * simply didn't compose. The template is the thing that knows where its picture belongs, so
 * it says so, and the editor moves the image there on apply.
 */
export type ImageSlot = {
  x: number;
  y: number;
  w: number;
  h: number;
  fit: "cover" | "contain";
  /**
   * Index in this template's own seeded array to splice the image into. Templates know their
   * own stacking: a full-bleed photo goes at 0 (behind the scrim), while an inset plate sits
   * above the background block but below the copy.
   */
  index: number;
  /** Corner radius in px, for templates that frame the photo rather than bleeding it. */
  radius?: number;
};

export type PostTemplate = {
  id: string;
  name: string;
  purposeTags: string[];
  copyZone: CopyZone;
  /** Tunes one composition across three aspect bands — see aspect-band.ts and D124. */
  seedLayers: (format: PostFormat) => PostLayer[];
  /**
   * Where the connected photo belongs in this composition, per format. Optional: a template
   * without one still applies, the editor just leaves the photo full-bleed at the back.
   */
  imageSlot?: (format: PostFormat) => ImageSlot;
};

type TemplateModule = {
  id: string;
  name: string;
  purposeTags: string[];
  copyZone: CopyZone;
  seedLayers: (format: PostFormat) => PostLayer[];
  imageSlot?: (format: PostFormat) => ImageSlot;
};

function toTemplate(mod: TemplateModule): PostTemplate {
  return {
    id: mod.id,
    name: mod.name,
    purposeTags: mod.purposeTags,
    copyZone: mod.copyZone,
    seedLayers: (format) => mod.seedLayers(format),
    imageSlot: mod.imageSlot ? (format) => mod.imageSlot!(format) : undefined,
  };
}

/**
 * Four templates, not fourteen. The other ten were cut on 2026-08-08 as not good enough to
 * put in front of a client — a library is judged by its weakest entry, and a mediocre one
 * costs more (it gets picked, then fought with) than it saves. These four hold up; the rest
 * are in git history if any is ever worth reviving.
 */
export const TEMPLATES: readonly PostTemplate[] = [
  toTemplate(lowerThird),
  toTemplate(insetCard),
  toTemplate(minimalFrame),
  toTemplate(numberedTips),
];

export function getTemplate(id: string): PostTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
