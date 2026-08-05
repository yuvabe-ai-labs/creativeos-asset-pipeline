import type { PostFormat, PostLayer } from "../types";
import type { CopyZone } from "../copy-zone-hint";
import * as lowerThird from "./lower-third";
import * as insetCard from "./inset-card";
import * as sideColumn from "./side-column";
import * as splitHalf from "./split-half";
import * as boldQuote from "./bold-quote";
import * as productHero from "./product-hero";
import * as beforeAfter from "./before-after";
import * as saleOffer from "./sale-offer";
import * as event from "./event";
import * as minimalFrame from "./minimal-frame";
import * as carouselCover from "./carousel-cover";
import * as testimonial from "./testimonial";
import * as announcement from "./announcement";
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
  /** Where the connected photo belongs in this composition, per format. */
  imageSlot: (format: PostFormat) => ImageSlot;
};

type TemplateModule = {
  id: string;
  name: string;
  purposeTags: string[];
  copyZone: CopyZone;
  seedLayers: (format: PostFormat) => PostLayer[];
  imageSlot: (format: PostFormat) => ImageSlot;
};

function toTemplate(mod: TemplateModule): PostTemplate {
  return {
    id: mod.id,
    name: mod.name,
    purposeTags: mod.purposeTags,
    copyZone: mod.copyZone,
    seedLayers: (format) => mod.seedLayers(format),
    imageSlot: (format) => mod.imageSlot(format),
  };
}

export const TEMPLATES: readonly PostTemplate[] = [
  toTemplate(lowerThird),
  toTemplate(insetCard),
  toTemplate(sideColumn),
  toTemplate(splitHalf),
  toTemplate(boldQuote),
  toTemplate(productHero),
  toTemplate(beforeAfter),
  toTemplate(saleOffer),
  toTemplate(event),
  toTemplate(minimalFrame),
  toTemplate(carouselCover),
  toTemplate(testimonial),
  toTemplate(announcement),
  toTemplate(numberedTips),
];

export function getTemplate(id: string): PostTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
