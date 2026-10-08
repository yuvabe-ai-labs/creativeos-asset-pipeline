// src/components/script-review/team/copy-link.ts
import { toast } from "sonner";

/** The full link for a path, in the browser (the client gets an absolute URL). */
export function absoluteLink(path: string): string {
  return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}

export async function copyLink(path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(absoluteLink(path));
    toast.success("Link copied");
  } catch {
    toast.error("Could not copy. Select the link and copy it.");
  }
}
