/** A one-tap reply under the copilot's newest message: a dashed primary chip, the same in every
 *  copilot panel. Goes on an outline, size "xs" Button.
 *  A fixed radius, not rounded-full: a one-line chip still reads as a pill, but a label that wraps
 *  (a long list of products/locations) becomes a rounded box with even padding instead of an oval
 *  whose text runs into the curved ends. */
export const REPLY_CHIP_CLASS =
  "h-auto max-w-full items-start justify-start whitespace-normal rounded-[0.875rem] border-dashed border-primary/40 px-3 py-1.5 text-left leading-snug text-primary hover:bg-primary/5";
