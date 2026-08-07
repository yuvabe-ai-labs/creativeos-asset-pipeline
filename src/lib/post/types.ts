export type PostFormat =
  | "ig-portrait"
  | "ig-square"
  | "ig-story"
  | "facebook-post"
  | "linkedin-post"
  | "linkedin-square"
  | "x-post"
  | "youtube-thumb"
  | "pinterest-pin"
  | "a4-print";

export type LayerBase = {
  id: string;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number; // 0-1, fraction of canvas
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  hidden?: boolean;
};

export type TextLayer = LayerBase & {
  kind: "text";
  text: string;
  fontFamily: string; // a fonts.ts FontKey
  fontSize: number; // 0-1 of canvas HEIGHT
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing?: number;
};

export type Fill =
  | { kind: "solid"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number };

/**
 * Which primitive a shape layer draws. Optional on the layer and defaulting to `"rect"`, so
 * every shape saved before this existed keeps rendering as the rectangle it always was.
 */
export type ShapeKind =
  | "rect"
  | "ellipse"
  | "triangle"
  | "star"
  | "diamond"
  | "line"
  | "arrow";

export type ShapeLayer = LayerBase & {
  kind: "shape";
  shape?: ShapeKind;
  fill: Fill;
  radius: number;
  stroke?: { color: string; width: number };
};

export type ImageSource =
  | { kind: "node"; nodeId: string } // live — resolved from a connected node at render time
  | { kind: "url"; url: string }; // upload

export type ImageLayer = LayerBase & {
  kind: "image";
  src: ImageSource;
  fit: "cover" | "contain";
  radius?: number;
  /**
   * Marks the layer placed by the Brand panel's Backgrounds section (D133). Placing a new
   * brand background removes any layer carrying this, so clicking three while deciding
   * leaves one — not two invisible full-bleed images the operator must hunt down.
   *
   * Optional and absent by default, so every layer saved before this existed is unaffected
   * (D10). Deliberately explicit rather than inferred from `w===1 && h===1`, which would
   * misclassify a deliberately full-bleed hero photo.
   */
  role?: "brand-background";
};

export type IconSource =
  | { kind: "lucide"; name: string }
  | { kind: "simple"; name: string }
  | { kind: "url"; url: string };

export type IconLayer = LayerBase & { kind: "icon"; src: IconSource; color?: string };

// A group's own x/y/w/h is the bounding box of its children at creation time; children keep
// their own x/y/w/h as absolute (not group-relative) normalized coordinates — post-group-layer.tsx
// (Task 7) renders them via a Konva Group whose own x/y/rotation transform is applied on top, so
// child coordinates stay in the SAME normalized-canvas space children already use everywhere else
// in this codebase (no new relative-coordinate system to reason about).
// `children` is the actual storage for each child's full layer data (name, kind, text, style...):
// grouping removes children from the top-level layers array, so this is the only place their data
// lives afterwards. `childIds` mirrors `children`'s ids/order and exists so id-only lookups (and
// callers that don't need full layer data) don't have to unpack `children`. It's optional only so
// constructing a bare GroupLayer without it still type-checks; groupLayers always sets it.
export type GroupLayer = LayerBase & {
  kind: "group";
  childIds: string[];
  children?: PostLayer[];
  // The group's own x/y/w/h/rotation at the moment it was created (rotation is always 0 then —
  // groupLayers never creates a pre-rotated group). ungroupLayers diffs this against the group's
  // CURRENT x/y/w/h/rotation to know how much the group has been moved/resized/rotated since
  // creation, so it can carry that same transform to the children before reinserting them. Public
  // (not file-local) because PostLayer flows through onPatch into persisted node data with no
  // Zod/normalizer schema today to preserve unknown keys across save/reload by contract.
  originBox?: { x: number; y: number; w: number; h: number; rotation: number };
};

export type PostLayer = TextLayer | ShapeLayer | ImageLayer | IconLayer | GroupLayer;

export type PostBackground =
  | { kind: "color"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "image"; src: ImageSource; fit: "cover" | "contain" };
