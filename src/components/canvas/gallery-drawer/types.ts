export type GalleryTab = "references" | "assets" | "moodboard";
export type ViewMode = "grid" | "list";

/** Unified shape rendered by the grid/list — covers both Drive and Assets sources. */
export type GalleryImage = {
  id: string;
  /** Thumbnail (Drive proxy or GCS URL). */
  imageUrl: string;
  /** Full-res URL for the zoom overlay. Falls back to `imageUrl` when absent. */
  previewUrl?: string;
  filename: string;
  subtitle: string;
  source: "drive" | "generated" | "moodboard";
  /** MIME type of the Drive file — required when source === "drive" for import. */
  driveMimeType?: string;
  /** Provenance page URL — set when source === "moodboard". */
  sourceUrl?: string;
  generationId?: string;
  /** Reference kind — set when source === "moodboard"; absent elsewhere. */
  kind?: import("@/lib/market/constants").ReferenceKind;
  /** MR's note on a market reference. */
  note?: string;
  /** The original reference URL (image_url) — what the lightbox plays. */
  mediaUrl?: string;
};

export type OpenDrawerOptions = {
  position?: { x: number; y: number };
  connectToNodeId?: string;
};
