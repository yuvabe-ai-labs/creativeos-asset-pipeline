export type GalleryTab = "references" | "assets";
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
  source: "drive" | "generated";
  /** MIME type of the Drive file — required when source === "drive" for import. */
  driveMimeType?: string;
  generationId?: string;
};

export type OpenDrawerOptions = {
  position?: { x: number; y: number };
  connectToNodeId?: string;
};
