import { cn } from "@/lib/utils";

/**
 * Every admin page and the admin tabs share one container, so the tabs and each page's title start
 * in the same place on every page (the models catalog's width). A page whose content reads better
 * narrower keeps that width, left-aligned under the tabs rather than centred.
 */
export const ADMIN_CONTAINER = "mx-auto w-full max-w-7xl px-4 md:px-6";

const READING_WIDTH = { full: "", wide: "[&>*]:max-w-5xl" } as const;

export function adminPageClass(width: keyof typeof READING_WIDTH = "full") {
  return cn(ADMIN_CONTAINER, "flex-1 pt-8 pb-14", READING_WIDTH[width]);
}
