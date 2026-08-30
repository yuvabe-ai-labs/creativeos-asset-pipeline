export type GridImage = {
  id: string;
  /** URL used in the grid/list tile — small, fast (e.g. Drive thumbnail proxy). */
  imageUrl: string;
  /** Optional full-resolution URL for the preview overlay. Falls back to `imageUrl`. */
  previewUrl?: string;
  filename: string;
  subtitle: string;
  /**
   * Market-reference kind, when this tile is a market reference. Present so the tile
   * can mark a reel as playable — without it a video reference is indistinguishable
   * from a still, since both render as a thumbnail.
   */
  kind?: import("@/lib/market/constants").ReferenceKind;
};

export type ViewMode = "grid" | "list";
