// Pure clipboard-image helpers for the canvas "Paste image" action. The browser
// wrappers (navigator.clipboard) are appended below and are not unit-tested.
import { FILE_NODE_IMAGE_EXTENSIONS } from "./file-constants";

// First image/* MIME among the clipboard item types, or null.
export function clipboardImageMime(types: readonly string[]): string | null {
  return types.find((t) => t.startsWith("image/")) ?? null;
}

// Supported image MIME → file extension (matching FILE_NODE_IMAGE_EXTENSIONS),
// or null when unsupported (e.g. image/gif, image/svg+xml).
export function mimeToImageExt(mime: string): "png" | "jpg" | "webp" | null {
  const map: Record<string, "png" | "jpg" | "webp"> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  const ext = map[mime];
  return ext && FILE_NODE_IMAGE_EXTENSIONS.has(ext) ? ext : null;
}
