// src/lib/script-review/anchors.ts
import { SCRIPT_CONTEXT_ANCHOR, castAnchor, shotAnchor } from "@/lib/scripts/anchors";
import type { Part } from "./types";

/** Where on the page a part sits: a view sits in its cast member's slot, a panel in its shot's row. */
export function partAnchor(part: Part): string {
  switch (part.kind) {
    case "context":
      return SCRIPT_CONTEXT_ANCHOR;
    case "shot":
    case "panel":
      return shotAnchor(part.shotId);
    case "cast":
    case "view":
      return castAnchor(part.castId);
  }
}
