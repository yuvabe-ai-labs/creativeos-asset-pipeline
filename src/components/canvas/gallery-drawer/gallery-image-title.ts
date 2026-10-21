import type { GalleryImage } from "./types";

// Deliberately NOT lib/nodes/title.ts's titleFromFilename: a gallery pick keeps the file's
// name as-is minus the extension ("hero-shot"), where an uploaded file's auto-title also reads
// separators as spaces ("hero shot"). nextFileNodeTitle() knows about both spellings, so
// replacing the attachment on a node created here still re-derives its title.
function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

/** The File node title for a gallery pick. A storyboard panel's name is already its title
 *  ("S3 · HOOK — storyboard", D383) and has no extension to drop — a beat may hold a dot. */
export function galleryImageTitle(image: GalleryImage): string {
  return image.source === "storyboard" ? image.filename : stripExtension(image.filename);
}
