import { FILE_NODE_IMAGE_EXTENSIONS } from "@/lib/nodes/file-constants";

// Derive a File-node filename from a remote image URL; fall back to a generic
// name when the URL carries no recognizable image extension.
export function filenameFromUrl(url: string): string {
  try {
    const path = url.split("?")[0].split("#")[0];
    const last = path.split("/").pop() ?? "";
    const ext = last.split(".").pop()?.toLowerCase() ?? "";
    if (last.includes(".") && FILE_NODE_IMAGE_EXTENSIONS.has(ext)) return last;
  } catch {
    /* fall through */
  }
  return "reference.jpg";
}
