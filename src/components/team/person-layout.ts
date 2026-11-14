// Shared looks for the people screens, so the same thing looks the same everywhere.

/** The ?person=<id> target, on a waiting card or a member row alike. Colour only: the row's
 *  padding never changes, so highlighting doesn't shift the layout. */
export const PERSON_HIGHLIGHT = "bg-primary/5 ring-1 ring-primary/30";

/** The element id the ?person=<id> target scrolls to. */
export const personAnchorId = (userId: string) => `person-${userId}`;

/** A client's Members list: Name / Status / Actions. From sm up the list is one grid and each
 *  row (person or invite) is a subgrid of it, so the columns line up across every row; on a phone
 *  each row stacks. */
export const MEMBERS_GRID = "sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-x-4";
export const MEMBERS_ROW =
  "flex flex-col gap-2 border-b py-3 text-sm last:border-b-0 sm:col-span-3 sm:grid sm:grid-cols-subgrid sm:items-center";
/** Anything under a Members row (a link to copy, a notice) spans all three columns. */
export const MEMBERS_FULL_WIDTH = "sm:col-span-3";
export const MEMBERS_ACTIONS = "flex flex-wrap items-center gap-2 max-sm:empty:hidden sm:justify-end";
