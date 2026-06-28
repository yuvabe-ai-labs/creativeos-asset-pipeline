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

// ── Browser wrappers (navigator.clipboard) — not unit-tested ──────────────────

// True if the clipboard currently holds a supported image. Fail-closed: returns
// false if the Clipboard API is unavailable or permission is denied.
export async function clipboardHasImage(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.read) return false;
    const items = await navigator.clipboard.read();
    return items.some((item) => clipboardImageMime(item.types) !== null);
  } catch {
    return false;
  }
}

// Read the first supported image off the clipboard as a named, File-ready blob,
// or null if none present / API unavailable / permission denied.
export async function readClipboardImage(): Promise<
  { blob: Blob; ext: string; filename: string } | null
> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.read) return null;
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const mime = clipboardImageMime(item.types);
      const ext = mime ? mimeToImageExt(mime) : null;
      if (mime && ext) {
        const blob = await item.getType(mime);
        return { blob, ext, filename: `pasted-${crypto.randomUUID()}.${ext}` };
      }
    }
    return null;
  } catch {
    return null;
  }
}
