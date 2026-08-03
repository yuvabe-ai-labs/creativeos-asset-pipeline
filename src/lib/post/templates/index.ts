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
  // format is accepted for future per-format layout variants (V2); V1 templates render
  // the same normalized layout regardless of format, since normalized geometry already
  // makes one composition render at any output size.
  seedLayers: (format: PostFormat) => PostLayer[];
};

function toTemplate(mod: typeof lowerThird): PostTemplate {
  return {
    id: mod.id,
    name: mod.name,
    purposeTags: mod.purposeTags,
    copyZone: mod.copyZone,
    seedLayers: () => mod.seedLayers(),
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
