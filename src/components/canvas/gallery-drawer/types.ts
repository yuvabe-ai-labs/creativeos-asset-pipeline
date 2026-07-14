import type { DriveImageItem } from "@/app/api/drive/images/route";

export type GalleryTab = "references" | "assets";

export type ViewMode = "grid" | "list";

export type Filters = {
  sharedOnly: boolean;
  folderIds: Set<string>;
};

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
  drive?: DriveImageItem;
  generationId?: string;
};

export type OpenDrawerOptions = {
  position?: { x: number; y: number };
  connectToNodeId?: string;
};
