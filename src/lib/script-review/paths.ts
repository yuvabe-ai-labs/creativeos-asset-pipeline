// src/lib/script-review/paths.ts
import { linkSlug } from "@/lib/client-review/paths";

/** The client's link for a script (D355): D311's titled shape, `/r/s/<title-slug>-<code>`, under the
 *  public prefix D309 opened, one segment deeper so it never meets a video review's link. Only the
 *  code finds the review; the title is for the client to read. */
export function scriptSharePathFor(code: string, title: string): string {
  return `/r/s/${linkSlug(title, "script")}-${code}`;
}
