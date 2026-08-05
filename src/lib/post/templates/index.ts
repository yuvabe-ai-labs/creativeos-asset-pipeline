import type { PostFormat, PostLayer } from "../types";
import type { CopyZone } from "../copy-zone-hint";
import * as lowerThird from "./lower-third";
import * as insetCard from "./inset-card";
import * as sideColumn from "./side-column";
import * as splitHalf from "./split-half";

export type PostTemplate = {
  id: string;
  name: string;
  purposeTags: string[];
  copyZone: CopyZone;
  /** Tunes one composition across three aspect bands — see aspect-band.ts and D124. */
  seedLayers: (format: PostFormat) => PostLayer[];
};

type TemplateModule = {
  id: string;
  name: string;
  purposeTags: string[];
  copyZone: CopyZone;
  seedLayers: (format: PostFormat) => PostLayer[];
};

function toTemplate(mod: TemplateModule): PostTemplate {
  return {
    id: mod.id,
    name: mod.name,
    purposeTags: mod.purposeTags,
    copyZone: mod.copyZone,
    seedLayers: (format) => mod.seedLayers(format),
  };
}

export const TEMPLATES: readonly PostTemplate[] = [
  toTemplate(lowerThird),
  toTemplate(insetCard),
  toTemplate(sideColumn),
  toTemplate(splitHalf),
];

export function getTemplate(id: string): PostTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
