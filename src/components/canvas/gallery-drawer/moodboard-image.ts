import { filenameFromUrl } from "@/lib/moodboards/filename";
import type { MoodboardItem } from "@/lib/db/moodboards";
import type { ReferenceKind } from "@/lib/market/constants";
import type { GalleryImage } from "./types";

// Display labels for market references in the drawer. Stills keep their derived
// filename; everything else is named by what it is, since a permalink has none.
const KIND_LABEL: Partial<Record<ReferenceKind, string>> = {
  instagram: "Instagram post",
  tiktok: "TikTok",
  youtube: "YouTube",
  video: "Video",
  link: "Link",
};

function hostOfUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** One moodboard/market item as the drawer's unified tile shape — shared by the
 *  Moodboards tab and the Signals tab (a signal's items are moodboard items). */
export function moodboardItemToGalleryImage(it: MoodboardItem): GalleryImage {
  return {
    id: it.id,
    // Grid always gets a renderable image; video/link kinds carry a re-hosted
    // thumbnail (or fall back to the raw URL, degrading like any dead image).
    imageUrl: it.thumbnail_url ?? it.image_url,
    previewUrl: it.thumbnail_url ?? it.image_url,
    // filenameFromUrl only yields something meaningful for direct image URLs; a
    // post permalink has no extension, so every market reference would read
    // "reference.jpg". Label those by what they actually are instead.
    filename:
      it.kind && it.kind !== "image" && it.kind !== "gif"
        ? `${KIND_LABEL[it.kind] ?? "Reference"} · ${hostOfUrl(it.image_url)}`
        : filenameFromUrl(it.image_url),
    subtitle: it.note ?? new Date(it.added_at).toLocaleDateString(),
    source: "moodboard" as const,
    sourceUrl: it.source_url ?? undefined,
    kind: it.kind,
    note: it.note ?? undefined,
    mediaUrl: it.image_url,
  };
}
