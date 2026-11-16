// Shared looks for the people screens, so the same thing looks the same everywhere.

/** The ?person=<id> target. Colour only: the row's padding never changes, so highlighting
 *  doesn't shift the layout. */
export const PERSON_HIGHLIGHT = "bg-primary/5 ring-1 ring-primary/30";

/** The element id of a person's row. */
export const personAnchorId = (userId: string) => `person-${userId}`;

/** Which optional columns a people list shows. Person, Status and Actions are always there;
 *  Permissions is left out for an Invite holder (their read has none), Clients on a client's
 *  own Members list. */
export type PeopleColumns = { permissions: boolean; clients: boolean };

const COUNT = (c: PeopleColumns) => 3 + Number(c.permissions) + Number(c.clients);

// Literal class strings, so Tailwind sees each one. From sm up the list is one grid and every row
// is a subgrid of it, so each column lines up across all rows; on a phone each row stacks.
const GRID: Record<number, string> = {
  3: "sm:grid-cols-[minmax(0,1fr)_auto_auto]",
  4: "sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,auto)_auto]",
  5: "sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,auto)_auto_auto]",
};
const SPAN: Record<number, string> = { 3: "sm:col-span-3", 4: "sm:col-span-4", 5: "sm:col-span-5" };

export const peopleGrid = (c: PeopleColumns) => `sm:grid sm:gap-x-6 ${GRID[COUNT(c)]}`;
/** A full-width line of the list (the header, a row, anything under a row). */
export const peopleSpan = (c: PeopleColumns) => SPAN[COUNT(c)];
export const PEOPLE_SUBGRID = "sm:grid sm:grid-cols-subgrid";

