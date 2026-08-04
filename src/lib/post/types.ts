export type PostFormat = "ig-square" | "ig-story" | "linkedin" | "a4-print";

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

export type ShapeLayer = LayerBase & {
  kind: "shape";
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
export type GroupLayer = LayerBase & { kind: "group"; childIds: string[] };

export type PostLayer = TextLayer | ShapeLayer | ImageLayer | IconLayer | GroupLayer;

export type PostBackground =
  | { kind: "color"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "image"; src: ImageSource; fit: "cover" | "contain" };
