export type GridImage = {
  id: string;
  /** URL used in the grid/list tile — small, fast (e.g. Drive thumbnail proxy). */
  imageUrl: string;
  /** Optional full-resolution URL for the preview overlay. Falls back to `imageUrl`. */
  previewUrl?: string;
  filename: string;
  subtitle: string;
};

export type ViewMode = "grid" | "list";
